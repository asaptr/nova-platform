import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { PrismaService } from '../../prisma/prisma.service'
import { ProxmoxService } from '../../proxmox/proxmox.service'
import { MikrotikService } from '../../mikrotik/mikrotik.service'
import { DnsmasqService } from '../../dnsmasq/dnsmasq.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { ConfigService } from '@nestjs/config'

@Processor('vm-provision')
export class ProvisionJob {
  private readonly logger = new Logger(ProvisionJob.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private dnsmasq: DnsmasqService,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  @Process('provision')
  async handle(job: Job) {
    const { vmId, userId, packageId, displayId, hostname, osTemplate, ipType, rootPassword } = job.data
    const node = this.config.get('PROXMOX_NODE')
    this.logger.log(`Provisioning VM ${displayId} (${vmId})`)

    try {
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'provisioning' } })

      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      const vmid = await this.proxmox.getNextVmid()

      let ip: string | undefined
      let sshPort: number | undefined
      const bridge = ipType === 'nat'
        ? this.config.get('NAT_BRIDGE')
        : this.config.get('PUBLIC_BRIDGE')

      let ipconfig: string | undefined
      if (ipType === 'nat') {
        const lastOctet = await this.allocateNatIpAtomic()
        ip = `10.20.0.${lastOctet}`
        sshPort = 22000 + lastOctet
        ipconfig = `ip=${ip}/24,gw=${this.config.get('NAT_GATEWAY')}`
      }

      await this.proxmox.createVm({
        node,
        vmid,
        name: displayId,
        cores: pkg.vcpu,
        memoryMb: pkg.ramMb,
        diskGb: pkg.diskGb,
        bridge,
        osTemplate,
        ipconfig,
      })

      if (ipType === 'nat') {
        const vmConfig = await this.proxmox.getVmConfig(node, vmid)
        const mac = vmConfig.net0.split(',')[0].replace('virtio=', '')
        await this.dnsmasq.addReservation(mac, ip, displayId)
        await this.mikrotik.addSshForward(ip, sshPort, displayId)
        await this.prisma.natPortForward.create({
          data: { vmId, externalPort: sshPort, internalPort: 22, isFree: true },
        })
      }

      await this.proxmox.startVm(node, vmid)
      await this.proxmox.waitForAgent(node, vmid, 120_000)
      await this.proxmox.setRootPassword(node, vmid, rootPassword)
      await this.proxmox.setHostname(node, vmid, hostname)

      await this.prisma.vm.update({
        where: { id: vmId },
        data: {
          status: 'running',
          proxmoxVmid: vmid,
          proxmoxNode: node,
          ipAddress: ip,
          sshPort: ipType === 'nat' ? sshPort : 22,
        },
      })

      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (user && ip) {
        await this.notifications.sendVmReady(user.email, {
          displayId,
          hostname,
          ipAddress: ip,
          sshPort: sshPort ?? 22,
          ipType,
        })
      }

      this.logger.log(`VM ${displayId} provisioned successfully`)
    } catch (err) {
      this.logger.error(`Provisioning failed for VM ${displayId}: ${err.message}`)
      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      const refund = Number(pkg.priceHourly) * 24
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: refund } },
      })
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'failed' } })
      throw err
    }
  }

  private async allocateNatIpAtomic(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const usedRows = await tx.$queryRaw<{ external_port: number }[]>`
        SELECT external_port FROM nat_port_forwards FOR UPDATE
      `
      const usedOctets = new Set(usedRows.map(r => r.external_port - 22000))
      for (let i = 2; i <= 254; i++) {
        if (!usedOctets.has(i)) return i
      }
      throw new Error('NAT IP pool penuh')
    })
  }
}
