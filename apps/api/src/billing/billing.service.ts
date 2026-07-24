import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'

const LOW_BALANCE_THRESHOLD = 10000
// VM suspended when balance <= -(priceHourly * GRACE_HOURS)
const GRACE_HOURS = 2
// Suspended VM auto-deleted after this many days
const GRACE_PERIOD_DAYS = 7

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async getTransactions(userId: string, page = 1, limit = 20, type?: string) {
    const skip = (page - 1) * limit
    const where: any = { userId }
    if (type) where.type = type
    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async getBillingUsage(userId: string, vmId?: string) {
    return this.prisma.billingUsage.findMany({
      where: { userId, ...(vmId ? { vmId } : {}) },
      orderBy: { periodStart: 'desc' },
      take: 200,
      include: { vm: { select: { displayId: true, hostname: true } } },
    })
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyBilling() {
    this.logger.log('Running hourly billing...')
    const runningVms = await this.prisma.vm.findMany({
      where: { status: 'running' },
      include: { package: true, user: true, natPortForwards: true },
    })

    const now = new Date()
    const periodStart = new Date(now.getTime() - 60 * 60 * 1000)

    for (const vm of runningVms) {
      const charge = Number(vm.package.priceHourly)
      const userBalance = Number(vm.user.balance)
      // Debt limit: suspend when balance already <= -(charge * GRACE_HOURS)
      const debtLimit = -(charge * GRACE_HOURS)

      // Already past grace period — suspend without charging more
      if (userBalance <= debtLimit) {
        await this.handleInsufficientBalance(vm)
        continue
      }

      // Charge — balance may go negative (grace period)
      const newBalance = userBalance - charge
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: vm.userId },
          data: { balance: { decrement: charge } },
        }),
        this.prisma.billingUsage.create({
          data: {
            vmId: vm.id,
            userId: vm.userId,
            amountCharged: charge,
            periodStart,
            periodEnd: now,
          },
        }),
      ])

      // After charging, check if now past debt limit
      if (newBalance <= debtLimit) {
        await this.handleInsufficientBalance(vm)
      } else if (newBalance < 0) {
        // In grace period — warn user
        await this.notifications.sendLowBalanceWarning(vm.user.email, newBalance).catch(() => {})
        this.logger.warn(`VM ${vm.displayId} in grace period — balance: ${newBalance}`)
      } else if (newBalance < LOW_BALANCE_THRESHOLD) {
        await this.notifications.sendLowBalanceWarning(vm.user.email, newBalance).catch(() => {})
      }
    }

    this.logger.log(`Billing done for ${runningVms.length} VMs`)
  }

  // Runs at 02:00 daily — delete VMs suspended past grace period
  @Cron('0 2 * * *')
  async checkExpiredVms() {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    const expiredVms = await this.prisma.vm.findMany({
      where: {
        status: 'suspended',
        expiresAt: { lte: cutoff },
      },
      include: { natPortForwards: true },
    })

    for (const vm of expiredVms) {
      this.logger.log(`Auto-deleting expired VM ${vm.displayId}`)
      if (vm.proxmoxVmid && vm.proxmoxNode) {
        await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid).catch(() => {})
        await this.proxmox.deleteVm(vm.proxmoxNode, vm.proxmoxVmid).catch((e) => {
          this.logger.warn(`Proxmox delete failed for ${vm.displayId}: ${e.message}`)
        })
      }
      for (const pf of vm.natPortForwards) {
        await this.mikrotik.removeSshForward(pf.externalPort).catch(() => {})
      }
      await this.prisma.vm.update({ where: { id: vm.id }, data: { status: 'deleted' } })
      this.logger.log(`VM ${vm.displayId} auto-deleted after ${GRACE_PERIOD_DAYS}-day grace`)
    }
  }

  private async handleInsufficientBalance(vm: any) {
    if (vm.proxmoxVmid && vm.proxmoxNode) {
      await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid).catch((e) => {
        this.logger.warn(`Could not stop VM ${vm.displayId}: ${e.message}`)
      })
      // Disable auto-restart so node reboots don't revive a suspended VM
      await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { onboot: 0 }).catch(() => {})
    }
    for (const pf of vm.natPortForwards ?? []) {
      await this.mikrotik.disableSshForward(pf.externalPort).catch(() => {})
    }
    const expiresAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    await this.prisma.vm.update({
      where: { id: vm.id },
      data: { status: 'suspended', expiresAt },
    })
    await this.audit.log({
      actorType: 'system',
      actorId: 'billing',
      action: 'vm.suspend',
      resourceType: 'vm',
      resourceId: vm.id,
      metadata: { displayId: vm.displayId, reason: 'insufficient_balance' },
    }).catch(() => {})
    await this.notifications.sendVmSuspended(vm.user.email, vm.hostname).catch(() => {})
    this.logger.warn(`VM ${vm.displayId} suspended — balance exceeded ${GRACE_HOURS}h debt limit`)
  }
}
