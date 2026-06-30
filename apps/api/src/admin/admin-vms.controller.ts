import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { AuditService } from '../audit/audit.service'

@Controller('admin/vms')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminVmsController {
  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private audit: AuditService,
  ) {}

  @Get()
  async listAll(
    @Query('status') status?: string,
    @Query('node') node?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const where: any = { status: { not: 'deleted' } }
    if (status) where.status = status
    if (node) where.proxmoxNode = node
    if (search) {
      where.OR = [
        { hostname: { contains: search, mode: 'insensitive' } },
        { displayId: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const skip = (+page - 1) * +limit
    const [items, total] = await Promise.all([
      this.prisma.vm.findMany({
        where,
        include: { user: { select: { email: true, fullName: true } }, package: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: +limit,
      }),
      this.prisma.vm.count({ where }),
    ])
    return { items, total, page: +page, limit: +limit }
  }

  @Get(':id')
  async getVm(@Param('id') id: string) {
    const vm = await this.prisma.vm.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true, balance: true } },
        package: true,
        natPortForwards: true,
        billingUsages: { orderBy: { periodStart: 'desc' }, take: 20 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    })
    if (!vm) return null

    let proxmoxStatus = null
    if (vm.proxmoxVmid && vm.proxmoxNode) {
      try {
        proxmoxStatus = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid)
      } catch {}
    }

    return { ...vm, proxmoxStatus }
  }

  private async vmAction(vmId: string, adminId: string, action: string, reason?: string, fn?: () => Promise<any>) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } })
    if (!vm?.proxmoxVmid || !vm?.proxmoxNode) return { error: 'VM belum ready' }

    await fn?.()
    await this.audit.log({
      actorType: 'admin',
      actorId: adminId,
      action: `vm.${action}`,
      resourceType: 'vm',
      resourceId: vmId,
      metadata: { reason },
    })
    return { message: `VM ${action} berhasil` }
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() b: { reason?: string }) {
    return this.vmAction(id, adminId, 'start', b.reason, async () => {
      const vm = await this.prisma.vm.findUnique({ where: { id } })
      await this.proxmox.startVm(vm.proxmoxNode, vm.proxmoxVmid)
      await this.prisma.vm.update({ where: { id }, data: { status: 'running' } })
    })
  }

  @Post(':id/stop')
  stop(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() b: { reason?: string; force?: boolean }) {
    return this.vmAction(id, adminId, b.force ? 'force_stop' : 'stop', b.reason, async () => {
      const vm = await this.prisma.vm.findUnique({ where: { id } })
      b.force ? await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid)
               : await this.proxmox.shutdownVm(vm.proxmoxNode, vm.proxmoxVmid)
      await this.prisma.vm.update({ where: { id }, data: { status: 'stopped' } })
    })
  }

  @Post(':id/reboot')
  reboot(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() b: { reason?: string }) {
    return this.vmAction(id, adminId, 'reboot', b.reason, async () => {
      const vm = await this.prisma.vm.findUnique({ where: { id } })
      await this.proxmox.rebootVm(vm.proxmoxNode, vm.proxmoxVmid)
    })
  }

  @Post(':id/suspend')
  async suspend(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() b: { reason?: string }) {
    const vm = await this.prisma.vm.findUnique({ where: { id }, include: { natPortForwards: true } })
    await this.proxmox.suspendVm(vm.proxmoxNode, vm.proxmoxVmid)
    for (const pf of vm.natPortForwards) {
      await this.mikrotik.disableSshForward(pf.externalPort).catch(() => {})
    }
    await this.prisma.vm.update({ where: { id }, data: { status: 'suspended' } })
    return this.vmAction(id, adminId, 'suspend', b.reason)
  }

  @Post(':id/unsuspend')
  async unsuspend(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() b: { reason?: string }) {
    const vm = await this.prisma.vm.findUnique({ where: { id }, include: { natPortForwards: true } })
    await this.proxmox.resumeVm(vm.proxmoxNode, vm.proxmoxVmid)
    for (const pf of vm.natPortForwards) {
      await this.mikrotik.enableSshForward(pf.externalPort).catch(() => {})
    }
    await this.prisma.vm.update({ where: { id }, data: { status: 'running' } })
    return this.vmAction(id, adminId, 'unsuspend', b.reason)
  }

  @Post(':id/console')
  async console(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id } })
    const ticket = await this.proxmox.createVncTicket(vm.proxmoxNode, vm.proxmoxVmid)
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'vm.console_access', resourceType: 'vm', resourceId: id,
    })
    return ticket
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() b: { password: string; reason?: string },
  ) {
    const vm = await this.prisma.vm.findUnique({ where: { id } })
    await this.proxmox.setRootPassword(vm.proxmoxNode, vm.proxmoxVmid, b.password)
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'vm.reset_password', resourceType: 'vm', resourceId: id,
      metadata: { reason: b.reason },
    })
    return { message: 'Password root berhasil direset' }
  }
}
