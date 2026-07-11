import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { AuditService } from '../audit/audit.service'
import { SystemConfigService } from '../system-config/system-config.service'

@Injectable()
export class VmsService {
  private readonly logger = new Logger(VmsService.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private audit: AuditService,
    private config: ConfigService,
    private systemConfig: SystemConfigService,
    @InjectQueue('vm-provision') private provisionQueue: Queue,
  ) {}

  async createVm(
    userId: string,
    packageId: string,
    osTemplate: string,
    hostname: string | undefined,
    rootPassword: string,
  ) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg || !pkg.isActive) throw new NotFoundException('Paket tidak ditemukan')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User tidak ditemukan')

    if (!rootPassword || rootPassword.length < 8) {
      throw new BadRequestException('Password minimal 8 karakter')
    }
    if (!/[a-zA-Z]/.test(rootPassword) || !/[0-9]/.test(rootPassword)) {
      throw new BadRequestException('Password harus mengandung huruf dan angka')
    }

    // Minimal saldo harus >= 0 (tidak boleh sudah minus) untuk buat VM baru
    if (Number(user.balance) < 0) {
      throw new BadRequestException('Saldo tidak boleh minus untuk membuat VM baru. Silakan topup terlebih dahulu.')
    }

    const brand = await this.systemConfig.getBrandConfig().catch(() => ({ name: 'NOVA' }))
    const brandSlug = (brand.name || 'NOVA').toLowerCase().replace(/\s+/g, '')

    const { vm } = await this.prisma.$transaction(async (tx) => {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
      const randomId = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      const displayId = `${brandSlug}-${randomId}`
      const resolvedHostname = displayId

      const vm = await tx.vm.create({
        data: {
          displayId,
          seqNum: 0,
          userId,
          packageId,
          hostname: resolvedHostname,
          ipType: pkg.ipType,
          status: 'pending',
          osTemplate,
        },
      })

      return { vm, displayId }
    })

    const template = await this.prisma.vmTemplate.findFirst({
      where: { proxmoxValue: osTemplate, isActive: true },
    })

    await this.provisionQueue.add('provision', {
      vmId: vm.id,
      userId,
      packageId,
      displayId: vm.displayId,
      hostname: vm.hostname,
      osTemplate,
      templateType: template?.templateType ?? 'clone',
      ipType: pkg.ipType,
      rootPassword,
    })

    await this.audit.log({
      actorType: 'user',
      actorId: userId,
      action: 'vm.create',
      resourceType: 'vm',
      resourceId: vm.id,
      metadata: { packageId, displayId: vm.displayId },
    })

    return { vmId: vm.id, displayId: vm.displayId, status: 'pending', message: 'VM sedang diproses' }
  }

  async getVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      include: { package: true, natPortForwards: true },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')

    // Live sync with Proxmox on every poll — detects real state after background ops complete
    if (vm.proxmoxVmid && vm.proxmoxNode && !['pending', 'provisioning', 'deleted', 'failed'].includes(vm.status)) {
      try {
        const live = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid)
        const synced = this.syncedStatus(live, vm.status)
        if (synced && synced !== vm.status) {
          await this.prisma.vm.update({ where: { id: vmId }, data: { status: synced } })
          ;(vm as any).status = synced
        }
      } catch {}
    }

    return this.enrichVm(vm)
  }

  private syncedStatus(live: any, dbStatus: string): string | null {
    const qmp: string = live.qmpstatus ?? live.status
    if (qmp === 'paused') return 'suspended'
    if (live.status === 'running') {
      // Running in Proxmox: only override transient or wrong DB states
      if (['starting', 'rebooting', 'stopping', 'stopped', 'suspended'].includes(dbStatus)) return 'running'
      return null
    }
    if (live.status === 'stopped') {
      if (dbStatus === 'suspended') return null // billing-suspended, keep it
      if (['stopping', 'starting', 'rebooting', 'running'].includes(dbStatus)) return 'stopped'
      return null
    }
    return null
  }

  async listVms(userId: string) {
    const vms = await this.prisma.vm.findMany({
      where: { userId, status: { not: 'deleted' } },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    })
    return Promise.all(vms.map(vm => this.enrichVm(vm)))
  }

  private async enrichVm(vm: any) {
    const natPublicIp = this.config.get('NAT_PUBLIC_IP') ?? null
    let templateName: string | null = null
    if (vm.osTemplate) {
      const tmpl = await this.prisma.vmTemplate.findFirst({
        where: { proxmoxValue: vm.osTemplate },
        select: { name: true },
      })
      templateName = tmpl?.name ?? null
    }
    return { ...vm, templateName, natPublicIp }
  }

  async listPackages() {
    return this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ ipType: 'asc' }, { priceMonthly: 'asc' }],
    })
  }

  async listTemplates() {
    return this.prisma.vmTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  private readonly TRANSIENT_STATUSES = ['starting', 'stopping', 'rebooting']

  private runBackground(fn: () => Promise<void>, onFail?: () => Promise<void>): void {
    fn().catch(async (e) => {
      this.logger.error(`Background VM op failed: ${e.message}`)
      await onFail?.().catch(() => {})
    })
  }

  async startVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      include: { package: true },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode) throw new BadRequestException('VM belum siap')

    if (this.TRANSIENT_STATUSES.includes(vm.status)) {
      throw new BadRequestException('VM sedang diproses, tunggu hingga selesai')
    }

    if (vm.status === 'suspended') {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } })
      if (Number(user.balance) < 0) {
        throw new BadRequestException(
          `Saldo masih minus (Rp ${Number(user.balance).toFixed(0)}). Silakan topup untuk melunasi tagihan sebelum menyalakan VM.`,
        )
      }
      const ports = await this.prisma.natPortForward.findMany({ where: { vmId } })
      for (const pf of ports) {
        await this.mikrotik.enableSshForward(pf.externalPort).catch(() => {})
      }
    }

    // Auto-fix VGA serial0 → std (non-fatal). Keep serial0 for xterm terminal.
    try {
      const config = await this.proxmox.getVmConfig(vm.proxmoxNode, vm.proxmoxVmid)
      if (config?.vga === 'serial0') {
        await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std' })
      }
    } catch {}

    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'starting', expiresAt: null } })

    this.runBackground(async () => {
      const liveStatus = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid).catch(() => null)
      if (liveStatus?.qmpstatus === 'paused' || liveStatus?.status === 'paused') {
        await this.proxmox.resumeVm(vm.proxmoxNode, vm.proxmoxVmid)
      } else {
        await this.proxmox.startVm(vm.proxmoxNode, vm.proxmoxVmid)
      }
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'running' } })
    }, () => this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopped' } }).then(() => {}))

    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.start', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM sedang dinyalakan...' }
  }

  async stopVm(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)

    if (this.TRANSIENT_STATUSES.includes(vm.status)) {
      throw new BadRequestException('VM sedang diproses, tunggu hingga selesai')
    }

    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopping' } })

    this.runBackground(async () => {
      // shutdownVm now waits with 90s timeout + force-stop fallback
      await this.proxmox.shutdownVm(vm.proxmoxNode, vm.proxmoxVmid)
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopped' } })
    }, async () => {
      // On failure, force stop and mark stopped
      await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid).catch(() => {})
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopped' } })
    })

    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.stop', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM sedang dimatikan...' }
  }

  async rebootVm(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)

    if (this.TRANSIENT_STATUSES.includes(vm.status)) {
      throw new BadRequestException('VM sedang diproses, tunggu hingga selesai')
    }

    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'rebooting' } })

    this.runBackground(async () => {
      await this.proxmox.rebootVm(vm.proxmoxNode, vm.proxmoxVmid)
      // Live sync will catch when VM comes back up; set running optimistically
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'running' } })
    }, () => this.prisma.vm.update({ where: { id: vmId }, data: { status: 'running' } }).then(() => {}))

    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.reboot', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM sedang di-reboot...' }
  }

  async getConsole(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)
    const ticket = await this.proxmox.createVncTicket(vm.proxmoxNode, vm.proxmoxVmid)
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.console_access', resourceType: 'vm', resourceId: vmId })
    return { ...ticket, node: vm.proxmoxNode, vmid: vm.proxmoxVmid }
  }

  async getTerminal(vmId: string, userId: string) {
    await this.findUserVm(vmId, userId)
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.terminal_access', resourceType: 'vm', resourceId: vmId })
    return { ok: true }
  }

  async resetPassword(vmId: string, userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('Password minimal 8 karakter')
    const vm = await this.findUserVm(vmId, userId)
    try {
      await this.proxmox.setRootPassword(vm.proxmoxNode, vm.proxmoxVmid, newPassword)
    } catch (e: any) {
      const detail = e?.response?.data?.errors ?? e?.response?.data?.message ?? e?.message ?? 'unknown'
      throw new BadRequestException(
        `Reset password gagal: QEMU guest agent tidak aktif di VM. Pastikan qemu-guest-agent terinstall dan VM sedang running. (${detail})`,
      )
    }
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.reset_password', resourceType: 'vm', resourceId: vmId })
    return { message: 'Password root berhasil direset' }
  }

  async deleteVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      include: { package: true, natPortForwards: true },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (vm.status === 'deleted') throw new BadRequestException('VM sudah dihapus')

    if (vm.proxmoxVmid && vm.proxmoxNode) {
      try {
        // Force stop first (wait for completion), then delete
        await this.proxmox.stopVm(vm.proxmoxNode, vm.proxmoxVmid).catch(() => {})
        await this.proxmox.deleteVm(vm.proxmoxNode, vm.proxmoxVmid)
      } catch (e: any) {
        this.logger.warn(`Proxmox delete failed for ${vm.displayId}: ${e.message}`)
      }
    }

    for (const pf of vm.natPortForwards) {
      await this.mikrotik.removeSshForward(pf.externalPort).catch(() => {})
    }

    await this.prisma.natPortForward.deleteMany({ where: { vmId } })
    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'deleted' } })

    await this.audit.log({
      actorType: 'user',
      actorId: userId,
      action: 'vm.delete',
      resourceType: 'vm',
      resourceId: vmId,
      metadata: { displayId: vm.displayId },
    })

    return { message: 'VM berhasil dihapus' }
  }

  async getVmLogs(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({ where: { id: vmId, userId }, select: { id: true } })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')

    const logs = await this.prisma.auditLog.findMany({
      where: { resourceType: 'vm', resourceId: vmId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, actorType: true, actorId: true, createdAt: true },
    })

    const userIds = [...new Set(logs.filter(l => l.actorType === 'user').map(l => l.actorId))]
    const adminIds = [...new Set(logs.filter(l => l.actorType === 'admin').map(l => l.actorId))]

    const [users, admins] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
      adminIds.length ? this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } }) : [],
    ])

    const userMap = Object.fromEntries(users.map(u => [u.id, u.email]))
    const adminMap = Object.fromEntries(admins.map(a => [a.id, a.email]))

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      actorType: log.actorType,
      actorLabel: log.actorType === 'user' ? (userMap[log.actorId] ?? 'User')
                : log.actorType === 'admin' ? (adminMap[log.actorId] ?? 'Admin')
                : 'Sistem',
      createdAt: log.createdAt,
    }))
  }

  async getVmStats(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      select: { proxmoxNode: true, proxmoxVmid: true, status: true, package: { select: { ramMb: true } } },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode || vm.status === 'stopped' || vm.status === 'suspended') {
      return null
    }
    try {
      const s = await this.proxmox.getVmStatus(vm.proxmoxNode, vm.proxmoxVmid)
      return {
        cpu: s.cpu ?? 0,
        mem: s.mem ?? 0,
        maxmem: s.maxmem ?? 0,
        pkgRamMb: (vm as any).package?.ramMb ?? null,
        uptime: s.uptime ?? 0,
        status: s.status,
      }
    } catch {
      return null
    }
  }

  private async findUserVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({ where: { id: vmId, userId } })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode) throw new BadRequestException('VM belum siap')
    return vm
  }
}
