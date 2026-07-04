import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { AuditService } from '../audit/audit.service'

@Injectable()
export class VmsService {
  private readonly logger = new Logger(VmsService.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private audit: AuditService,
    private config: ConfigService,
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

    const { vm } = await this.prisma.$transaction(async (tx) => {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
      const randomId = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      const displayId = `ln-${randomId}`
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
    return this.enrichVm(vm)
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

  async startVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      include: { package: true },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode) throw new BadRequestException('VM belum siap')

    // Block start if balance still negative (hutang belum dilunasi via topup)
    if (vm.status === 'suspended') {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } })
      if (Number(user.balance) < 0) {
        throw new BadRequestException(
          `Saldo masih minus (Rp ${Number(user.balance).toFixed(0)}). Silakan topup untuk melunasi tagihan sebelum menyalakan VM.`,
        )
      }
      // Re-enable MikroTik NAT ports before starting
      const ports = await this.prisma.natPortForward.findMany({ where: { vmId } })
      for (const pf of ports) {
        await this.mikrotik.enableSshForward(pf.externalPort).catch(() => {})
      }
    }

    // Auto-fix VGA serial0 → std before starting (non-fatal)
    try {
      const config = await this.proxmox.getVmConfig(vm.proxmoxNode, vm.proxmoxVmid)
      if (config?.vga === 'serial0') {
        await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std', delete: 'serial0' })
      }
    } catch {}

    await this.proxmox.startVm(vm.proxmoxNode, vm.proxmoxVmid)
    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'running', expiresAt: null } })
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.start', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM dimulai' }
  }

  async stopVm(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)
    await this.proxmox.shutdownVm(vm.proxmoxNode, vm.proxmoxVmid)
    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopped' } })
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.stop', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM dihentikan' }
  }

  async rebootVm(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)
    await this.proxmox.rebootVm(vm.proxmoxNode, vm.proxmoxVmid)
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.reboot', resourceType: 'vm', resourceId: vmId })
    return { message: 'VM di-reboot' }
  }

  async getConsole(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)
    const ticket = await this.proxmox.createVncTicket(vm.proxmoxNode, vm.proxmoxVmid)
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.console_access', resourceType: 'vm', resourceId: vmId })
    return { ...ticket, node: vm.proxmoxNode, vmid: vm.proxmoxVmid }
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

  private async findUserVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({ where: { id: vmId, userId } })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode) throw new BadRequestException('VM belum siap')
    return vm
  }
}
