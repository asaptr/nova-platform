import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { NotificationsService } from '../notifications/notifications.service'

const LOW_BALANCE_THRESHOLD = 10000

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private prisma: PrismaService,
    private mikrotik: MikrotikService,
    private notifications: NotificationsService,
  ) {}

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where: { userId } }),
    ])
    return { items, total, page, limit }
  }

  async getBillingUsage(userId: string, vmId?: string) {
    return this.prisma.billingUsage.findMany({
      where: { userId, ...(vmId ? { vmId } : {}) },
      orderBy: { periodStart: 'desc' },
      take: 50,
    })
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyBilling() {
    this.logger.log('Running hourly billing...')
    const runningVms = await this.prisma.vm.findMany({
      where: { status: 'running' },
      include: { package: true, user: true },
    })

    const now = new Date()
    const periodStart = new Date(now.getTime() - 60 * 60 * 1000)

    for (const vm of runningVms) {
      const charge = Number(vm.package.priceHourly)
      const userBalance = Number(vm.user.balance)

      if (userBalance < charge) {
        await this.handleInsufficientBalance(vm)
        continue
      }

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

      const newBalance = userBalance - charge
      if (newBalance < LOW_BALANCE_THRESHOLD) {
        await this.notifications.sendLowBalanceWarning(vm.user.email, newBalance)
      }
    }

    this.logger.log(`Billing done for ${runningVms.length} VMs`)
  }

  @Cron('0 2 * * *')
  async checkExpiredVms() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const suspendedVms = await this.prisma.vm.findMany({
      where: {
        status: 'suspended',
        updatedAt: { lte: threeDaysAgo },
      },
      include: { natPortForwards: true },
    })

    for (const vm of suspendedVms) {
      await this.prisma.vm.update({ where: { id: vm.id }, data: { status: 'deleted' } })
      for (const pf of vm.natPortForwards) {
        await this.mikrotik.removeSshForward(pf.externalPort).catch(() => {})
      }
      this.logger.log(`VM ${vm.displayId} deleted after grace period`)
    }
  }

  private async handleInsufficientBalance(vm: any) {
    await this.prisma.vm.update({ where: { id: vm.id }, data: { status: 'suspended' } })
    for (const pf of vm.natPortForwards ?? []) {
      await this.mikrotik.disableSshForward(pf.externalPort).catch(() => {})
    }
    await this.notifications.sendVmSuspended(vm.user.email, vm.hostname)
    this.logger.warn(`VM ${vm.displayId} suspended — insufficient balance`)
  }
}
