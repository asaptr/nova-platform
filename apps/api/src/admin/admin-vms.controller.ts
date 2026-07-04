import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
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
    let proxmoxConfig = null
    if (vm.proxmoxVmid && vm.proxmoxNode) {
      try {
        [proxmoxStatus, proxmoxConfig] = await Promise.all([
          this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid),
          this.proxmox.getVmConfig(vm.proxmoxNode, vm.proxmoxVmid),
        ])
      } catch {}
    }

    const template = vm.osTemplate
      ? await this.prisma.vmTemplate.findFirst({ where: { proxmoxValue: vm.osTemplate }, select: { name: true } })
      : null
    return { ...vm, templateName: template?.name ?? null, proxmoxStatus: { ...proxmoxStatus, vga: proxmoxConfig?.vga } }
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
      // Auto-fix VGA serial0 → std before starting (non-fatal)
      try {
        const config = await this.proxmox.getVmConfig(vm.proxmoxNode, vm.proxmoxVmid)
        if (config?.vga === 'serial0') {
          await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std', delete: 'serial0' })
        }
      } catch {}
      // Check live Proxmox status to decide resume vs start
      // Billing suspension = stopVm (Proxmox: stopped), admin suspension = suspendVm (Proxmox: paused)
      const liveStatus = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid).catch(() => null)
      if (liveStatus?.status === 'paused') {
        await this.proxmox.resumeVm(vm.proxmoxNode, vm.proxmoxVmid)
      } else {
        await this.proxmox.startVm(vm.proxmoxNode, vm.proxmoxVmid)
      }
      await this.prisma.vm.update({ where: { id }, data: { status: 'running', expiresAt: null } })
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
    return { ...ticket, node: vm.proxmoxNode, vmid: vm.proxmoxVmid }
  }

  @Post(':id/sync-status')
  async syncStatus(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id } })
    if (!vm?.proxmoxVmid || !vm?.proxmoxNode) return { error: 'VM belum ready' }
    const live = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid)
    const statusMap: Record<string, string> = { running: 'running', stopped: 'stopped', paused: 'suspended' }
    const newStatus = statusMap[live.status] ?? vm.status
    await this.prisma.vm.update({ where: { id }, data: { status: newStatus } })
    await this.audit.log({ actorType: 'admin', actorId: adminId, action: 'vm.sync_status', resourceType: 'vm', resourceId: id })
    return { status: newStatus, proxmoxStatus: live.status }
  }

  @Post(':id/fix-vga')
  async fixVga(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id } })
    if (!vm?.proxmoxVmid || !vm?.proxmoxNode) return { error: 'VM belum ready' }
    const config = await this.proxmox.getVmConfig(vm.proxmoxNode, vm.proxmoxVmid)
    const currentVga = config.vga ?? 'std'
    if (currentVga !== 'serial0') return { message: `VGA sudah ${currentVga}, tidak perlu diubah` }
    await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std', delete: 'serial0' })
    await this.audit.log({ actorType: 'admin', actorId: adminId, action: 'vm.fix_vga', resourceType: 'vm', resourceId: id })
    return { message: 'VGA diubah ke std, delete serial0. VM perlu direboot agar perubahan berlaku.' }
  }

  @Delete(':id')
  @Roles('superadmin')
  async deleteVm(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id }, include: { natPortForwards: true } })
    if (!vm) return { error: 'VM tidak ditemukan' }

    if (vm.proxmoxVmid && vm.proxmoxNode) {
      await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid).catch(() => {})
      await this.proxmox.deleteVm(vm.proxmoxNode, vm.proxmoxVmid).catch((e: any) => {
        throw new Error(`Proxmox delete gagal: ${e.message}`)
      })
    }
    for (const pf of vm.natPortForwards) {
      await this.mikrotik.removeSshForward(pf.externalPort).catch(() => {})
    }
    await this.prisma.vm.update({ where: { id }, data: { status: 'deleted' } })
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'vm.delete', resourceType: 'vm', resourceId: id,
    })
    return { message: 'VM berhasil dihapus' }
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() b: { password: string; reason?: string },
  ) {
    const vm = await this.prisma.vm.findUnique({ where: { id } })
    if (!vm?.proxmoxVmid || !vm?.proxmoxNode) return { error: 'VM belum ready' }
    try {
      await this.proxmox.setRootPassword(vm.proxmoxNode, vm.proxmoxVmid, b.password)
    } catch (e: any) {
      const detail = e?.response?.data?.errors ?? e?.response?.data?.message ?? e?.message ?? 'unknown'
      return { error: `Reset password gagal: QEMU guest agent tidak aktif. Pastikan qemu-guest-agent terinstall dan VM running. (${detail})` }
    }
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: 'vm.reset_password', resourceType: 'vm', resourceId: id,
      metadata: { reason: b.reason },
    })
    return { message: 'Password root berhasil direset' }
  }
}
