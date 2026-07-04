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
    const { vmId, userId, packageId, displayId, hostname, osTemplate, templateType, ipType, rootPassword } = job.data
    const node = this.config.get('PROXMOX_NODE')
    this.logger.log(`Provisioning VM ${displayId} (${vmId}) mode=${templateType ?? 'clone'}`)

    const step = (s: string) => this.logger.log(`[${displayId}] STEP: ${s}`)

    try {
      step('start — marking provisioning')
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'provisioning' } })

      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      step(`pkg loaded: vcpu=${pkg.vcpu} ram=${pkg.ramMb} disk=${pkg.diskGb}`)

      const vmid = await this.proxmox.getNextVmid()
      step(`next vmid: ${vmid}`)

      let ip: string | undefined
      let sshPort: number | undefined
      const bridge = ipType === 'nat'
        ? this.config.get('NAT_BRIDGE')
        : this.config.get('PUBLIC_BRIDGE')
      step(`bridge: ${bridge}`)

      let ipconfig: string | undefined
      if (ipType === 'nat') {
        const lastOctet = await this.allocateNatIpAtomic()
        ip = `10.20.0.${lastOctet}`
        sshPort = 22000 + lastOctet
        ipconfig = `ip=${ip}/24,gw=${this.config.get('NAT_GATEWAY')}`
        step(`nat ip: ${ip} sshPort: ${sshPort}`)
        // Reserve IP in DB immediately so concurrent jobs don't get the same octet
        await this.prisma.vm.update({
          where: { id: vmId },
          data: { ipAddress: ip, sshPort },
        })
      }

      // Auto-detect mode: if osTemplate is a number → clone, otherwise → iso
      const mode: string = templateType ?? (Number.isFinite(Number(osTemplate)) ? 'clone' : 'iso')
      step(`mode: ${mode}, osTemplate: ${osTemplate}`)

      if (mode === 'clone') {
        const templateVmid = Number(osTemplate)
        if (!Number.isFinite(templateVmid)) throw new Error(`Template VMID tidak valid: ${osTemplate}`)

        const cloneStorage = this.config.get('CLONE_STORAGE') || undefined
        step(`cloning from VMID ${templateVmid} → new VMID ${vmid} (storage: ${cloneStorage ?? 'auto'})`)
        const upid = await this.proxmox.cloneVm(node, templateVmid, vmid, displayId, cloneStorage)
        step(`clone task started: ${upid}`)
        await this.proxmox.waitForTask(node, upid)
        step('clone task complete')

        // Step 1: fix hardware first (remove serial0 VGA, set std VGA + specs)
        // Must be done in a separate call before cloud-init config
        step('updateVmConfig hardware (cpu/ram/vga)')
        await this.proxmox.updateVmConfig(node, vmid, {
          cores: pkg.vcpu,
          memory: Number(pkg.ramMb),
          vga: 'std',
          delete: 'serial0',  // remove serial0 device so vga:std takes effect cleanly
        }).catch((e) => {
          this.logger.warn(`[${displayId}] hardware config warn: ${e.response?.data?.errors ?? e.message}`)
        })

        // Step 2: cloud-init + network config
        const configUpdate: Record<string, any> = {
          name: displayId,
          ciuser: 'root',
          cipassword: rootPassword,
        }
        if (ipconfig) configUpdate.ipconfig0 = ipconfig
        if (bridge) configUpdate.net0 = `virtio,bridge=${bridge}`
        step(`updateVmConfig cloud-init: ipconfig=${ipconfig ?? 'none'} net0=${bridge ?? 'skip'}`)
        await this.proxmox.updateVmConfig(node, vmid, configUpdate)

        step('resizeDisk')
        await this.proxmox.resizeDisk(node, vmid, Number(pkg.diskGb)).catch((e) => {
          this.logger.warn(`[${displayId}] Disk resize skipped: ${e.response?.data?.errors ?? e.message}`)
        })
      } else {
        step('createVmRaw (ISO mode)')
        const body: Record<string, any> = {
          vmid,
          name: displayId,
          cores: pkg.vcpu,
          memory: pkg.ramMb,
          net0: `virtio,bridge=${bridge}`,
          ostype: 'l26',
          scsi0: `local-lvm:${pkg.diskGb}`,
          scsihw: 'virtio-scsi-pci',
          boot: 'order=scsi0',
          agent: 'enabled=1',
          vga: 'std',
          ide2: `${osTemplate},media=cdrom`,
        }
        if (ipconfig) body.ipconfig0 = ipconfig
        await this.proxmox.createVmRaw(node, body)
      }

      if (ipType === 'nat') {
        step('reading vm config for MAC')
        const vmConfig = await this.proxmox.getVmConfig(node, vmid)
        const netStr = vmConfig.net0 ?? ''
        const macMatch = netStr.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/)
        const mac = macMatch ? macMatch[1] : ''
        step(`mac: ${mac}`)
        if (mac) await this.dnsmasq.addReservation(mac, ip, displayId).catch((e) => {
          this.logger.warn(`[${displayId}] dnsmasq skipped: ${e.message}`)
        })
        step('mikrotik addSshForward')
        await this.mikrotik.addSshForward(ip, sshPort, displayId).catch((e) => {
          this.logger.warn(`[${displayId}] MikroTik NAT forward gagal (bisa setup manual): ${e.message}`)
        })
        await this.prisma.natPortForward.create({
          data: { vmId, externalPort: sshPort, internalPort: 22, isFree: true },
        })
      }

      step('startVm')
      await this.proxmox.startVm(node, vmid)

      // Save proxmoxVmid + IP early — so dashboard shows data even if agent is slow
      step('saving vmid and IP to DB')
      await this.prisma.vm.update({
        where: { id: vmId },
        data: {
          proxmoxVmid: vmid,
          proxmoxNode: node,
          ipAddress: ip,
          sshPort: ipType === 'nat' ? sshPort : 22,
        },
      })

      if (mode === 'clone') {
        step('waitForAgent (120s) — optional, password already set via cloud-init')
        await this.proxmox.waitForAgent(node, vmid, 120_000).then(async () => {
          step('agent ready — setHostname via agent')
          await this.proxmox.setHostname(node, vmid, hostname).catch((e) => {
            this.logger.warn(`[${displayId}] setHostname via agent failed: ${e.message}`)
          })
        }).catch((e) => {
          this.logger.warn(`[${displayId}] Agent tidak ready (${e.message}), password sudah di-set via cloud-init`)
        })
      }

      step('updating VM record to running')
      await this.prisma.vm.update({
        where: { id: vmId },
        data: { status: mode === 'clone' ? 'running' : 'provisioning' },
      })

      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (user && ip) {
        await this.notifications.sendVmReady(user.email, {
          displayId, hostname, ipAddress: ip,
          sshPort: sshPort ?? 22, ipType,
        }).catch((e) => this.logger.warn(`[${displayId}] notification skipped: ${e.message}`))
      }

      this.logger.log(`VM ${displayId} provisioned successfully`)
    } catch (err) {
      const proxmoxDetail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err?.cause ? String(err.cause) : ''
      this.logger.error(
        `Provisioning failed for VM ${displayId} at step above: ${err.message} | proxmox=${proxmoxDetail}`,
      )
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'failed' } })
      throw err
    }
  }

  private async allocateNatIpAtomic(): Promise<number> {
    // Check both NatPortForward records AND vm.ipAddress to handle concurrent provisioning
    const [forwards, vms] = await Promise.all([
      this.prisma.natPortForward.findMany({ select: { externalPort: true } }),
      // Include failed VMs — their IP stays reserved until explicitly deleted
      this.prisma.vm.findMany({
        where: { ipAddress: { startsWith: '10.20.0.' }, status: { not: 'deleted' } },
        select: { ipAddress: true },
      }),
    ])
    const usedOctets = new Set([
      ...forwards.map(r => r.externalPort - 22000),
      ...vms.map(v => parseInt(v.ipAddress!.split('.')[3])).filter(n => !isNaN(n)),
    ])
    for (let i = 2; i <= 254; i++) {
      if (!usedOctets.has(i)) return i
    }
    throw new Error('NAT IP pool penuh')
  }
}
