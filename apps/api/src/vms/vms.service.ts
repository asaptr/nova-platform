import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { AuditService } from '../audit/audit.service'

@Injectable()
export class VmsService {
  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private audit: AuditService,
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

    const minBalance = Number(pkg.priceHourly) * 24
    if (Number(user.balance) < minBalance) {
      throw new BadRequestException(`Saldo tidak cukup. Minimal Rp ${minBalance.toFixed(0)}`)
    }

    const { vm } = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.vmCounter.upsert({
        where: { ipType: pkg.ipType },
        create: { ipType: pkg.ipType, lastSeq: 1 },
        update: { lastSeq: { increment: 1 } },
      })
      const prefix = pkg.ipType === 'public' ? 'pub' : 'nat'
      const displayId = `ln-${prefix}-${String(counter.lastSeq).padStart(4, '0')}`
      const resolvedHostname = hostname?.trim() || displayId

      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: minBalance } },
      })

      const vm = await tx.vm.create({
        data: {
          displayId,
          seqNum: counter.lastSeq,
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

    await this.provisionQueue.add('provision', {
      vmId: vm.id,
      userId,
      packageId,
      displayId: vm.displayId,
      hostname: vm.hostname,
      osTemplate,
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
    return vm
  }

  async listVms(userId: string) {
    return this.prisma.vm.findMany({
      where: { userId, status: { not: 'deleted' } },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async listPackages() {
    return this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ ipType: 'asc' }, { priceMonthly: 'asc' }],
    })
  }

  async startVm(vmId: string, userId: string) {
    const vm = await this.findUserVm(vmId, userId)
    await this.proxmox.startVm(vm.proxmoxNode, vm.proxmoxVmid)
    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'running' } })
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
    return ticket
  }

  async resetPassword(vmId: string, userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('Password minimal 8 karakter')
    const vm = await this.findUserVm(vmId, userId)
    await this.proxmox.setRootPassword(vm.proxmoxNode, vm.proxmoxVmid, newPassword)
    await this.audit.log({ actorType: 'user', actorId: userId, action: 'vm.reset_password', resourceType: 'vm', resourceId: vmId })
    return { message: 'Password root berhasil direset' }
  }

  private async findUserVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({ where: { id: vmId, userId } })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')
    if (!vm.proxmoxVmid || !vm.proxmoxNode) throw new BadRequestException('VM belum siap')
    return vm
  }
}
