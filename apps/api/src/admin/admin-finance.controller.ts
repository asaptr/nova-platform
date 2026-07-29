import { Controller, Get, Post, Body, Param, Query, UseGuards, Logger } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { AuditService } from '../audit/audit.service'

@Controller('admin/finance')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('superadmin')
export class AdminFinanceController {
  private readonly logger = new Logger(AdminFinanceController.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private audit: AuditService,
  ) {}

  @Get('revenue')
  async revenue(@Query('month') month?: string) {
    const now = new Date()
    const start = month
      ? new Date(month)
      : new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)

    const [totalRevenue, topupVolume, vmCount, userCount] = await Promise.all([
      this.prisma.billingUsage.aggregate({
        _sum: { amountCharged: true },
        where: { periodStart: { gte: start, lt: end } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'topup', status: 'success', createdAt: { gte: start, lt: end } },
      }),
      this.prisma.vm.count({ where: { status: 'running' } }),
      this.prisma.user.count({ where: { status: 'active' } }),
    ])

    const revenue = Number(totalRevenue._sum.amountCharged ?? 0)
    const topup = Number(topupVolume._sum.amount ?? 0)

    return {
      period: { start, end },
      revenue,
      topupVolume: topup,
      activeVms: vmCount,
      activeUsers: userCount,
      arpu: userCount > 0 ? revenue / userCount : 0,
    }
  }

  @Get('profit')
  async profit(@Query('month') month?: string) {
    const now = new Date()
    const start = month ? new Date(month) : new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)

    const [revResult, costsResult, topupResult] = await Promise.all([
      this.prisma.billingUsage.aggregate({
        _sum: { amountCharged: true },
        where: { periodStart: { gte: start, lt: end } },
      }),
      this.prisma.serverCost.aggregate({
        _sum: { amount: true },
        where: { periodMonth: { gte: start, lt: end } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'topup', status: 'success', createdAt: { gte: start, lt: end } },
      }),
    ])

    const revenue = Number(revResult._sum.amountCharged ?? 0)
    const cogs = Number(costsResult._sum.amount ?? 0)
    const pgFee = Number(topupResult._sum.amount ?? 0) * 0.02
    const grossProfit = revenue - cogs - pgFee
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

    return { revenue, cogs, pgFee, grossProfit, grossMargin: grossMargin.toFixed(1) }
  }

  @Get('costs')
  getCosts() {
    return this.prisma.serverCost.findMany({ orderBy: { periodMonth: 'desc' } })
  }

  @Post('costs')
  async addCost(
    @CurrentUser('sub') adminId: string,
    @Body() body: { label: string; amount: number; periodMonth: string; notes?: string },
  ) {
    const cost = await this.prisma.serverCost.create({
      data: {
        label: body.label,
        amount: body.amount,
        periodMonth: new Date(body.periodMonth),
        notes: body.notes,
      },
    })
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'finance.add_cost', metadata: { label: body.label, amount: body.amount },
    })
    return cost
  }

  @Post('users/:userId/adjust-balance')
  async adjustBalance(
    @Param('userId') userId: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { amount: number; notes?: string },
  ) {
    const { amount, notes } = body
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      }),
      this.prisma.transaction.create({
        data: {
          userId,
          type: 'adjustment',
          amount,
          status: 'success',
          gateway: 'manual',
          notes,
          createdBy: adminId,
        },
      }),
    ])
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'finance.adjust_balance',
      resourceType: 'user', resourceId: userId,
      metadata: { amount, notes },
    })
    return { message: 'Saldo berhasil disesuaikan' }
  }

  @Get('capacity')
  async capacity() {
    try {
      const [nodes, vms] = await Promise.all([
        this.proxmox.getNodes(),
        this.prisma.vm.findMany({
          where: { status: { notIn: ['deleted', 'failed'] } },
          select: { package: { select: { vcpu: true, ramMb: true, diskGb: true } } },
        }),
      ])

      const alloc = vms.reduce((acc, v) => ({
        cpu:  acc.cpu  + (v.package?.vcpu  ?? 0),
        ram:  acc.ram  + (v.package?.ramMb ?? 0),
        disk: acc.disk + (v.package?.diskGb ?? 0),
      }), { cpu: 0, ram: 0, disk: 0 })

      const totalCpu  = nodes.reduce((s: number, n: any) => s + (n.maxcpu  ?? 0), 0)
      const totalRam  = nodes.reduce((s: number, n: any) => s + Math.round((n.maxmem  ?? 0) / 1_073_741_824), 0)
      const totalDisk = nodes.reduce((s: number, n: any) => s + Math.round((n.maxdisk ?? 0) / 1_073_741_824), 0)

      return {
        totalCpu,  usedCpu:  alloc.cpu,
        totalRam,  usedRam:  Math.round(alloc.ram / 1024),
        totalDisk, usedDisk: alloc.disk,
        nodes,
      }
    } catch (e: any) {
      this.logger.error(`capacity() failed: ${e?.message}`, e?.stack)
      return { totalCpu: 0, usedCpu: 0, totalRam: 0, usedRam: 0, totalDisk: 0, usedDisk: 0, nodes: [], error: 'Tidak dapat terhubung ke Proxmox' }
    }
  }

  @Get('top-spenders')
  async topSpenders(@Query('month') month?: string) {
    const now = new Date()
    const start = month ? new Date(month) : new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)

    const grouped = await this.prisma.billingUsage.groupBy({
      by: ['userId'],
      _sum: { amountCharged: true },
      where: { periodStart: { gte: start, lt: end } },
      orderBy: { _sum: { amountCharged: 'desc' } },
      take: 10,
    })

    const userIds = grouped.map(g => g.userId)
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, fullName: true },
    })
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))

    return grouped.map(g => ({
      userId: g.userId,
      email: userMap[g.userId]?.email ?? '—',
      fullName: userMap[g.userId]?.fullName ?? '—',
      totalSpent: Number(g._sum.amountCharged ?? 0),
    }))
  }
}
