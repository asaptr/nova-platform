import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { PrismaService } from '../../prisma/prisma.service'
import { ProxmoxService } from '../../proxmox/proxmox.service'
import { MikrotikService } from '../../mikrotik/mikrotik.service'
import { DnsmasqService } from '../../dnsmasq/dnsmasq.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { ConfigService } from '@nestjs/config'
import { VmMotdService } from '../vm-motd.service'
import { SystemConfigService } from '../../system-config/system-config.service'

// ── CIDR helpers ──────────────────────────────────────────────────────────────
function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => ((acc << 8) | parseInt(o)) >>> 0, 0) >>> 0
}
function numToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}
function parseCidr(cidr: string) {
  const [ipPart, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr ?? '24')
  const totalHosts = Math.pow(2, 32 - prefix)
  const mask = (~(totalHosts - 1)) >>> 0
  const networkNum = (ipToNum(ipPart) & mask) >>> 0
  const broadcastNum = (networkNum + totalHosts - 1) >>> 0
  return { networkNum, broadcastNum, prefix, gateway: numToIp(networkNum + 1) }
}
// ─────────────────────────────────────────────────────────────────────────────

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
    private vmMotd: VmMotdService,
    private systemConfig: SystemConfigService,
  ) {}

  @Process('provision')
  async handle(job: Job) {
    const { vmId, userId, packageId, displayId, hostname, osTemplate, templateType, ipType, rootPassword } = job.data

    // Proxmox node: DB > env
    const node = (await this.systemConfig.get('proxmox.node').catch(() => null))
      || this.config.get('PROXMOX_NODE')
    this.logger.log(`Provisioning VM ${displayId} (${vmId}) mode=${templateType ?? 'clone'}`)

    const step = (s: string) => this.logger.log(`[${displayId}] STEP: ${s}`)

    try {
      step('start — marking provisioning')
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'provisioning' } })

      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      step(`pkg loaded: vcpu=${pkg.vcpu} ram=${pkg.ramMb} disk=${pkg.diskGb}`)

      // Cross-check PVE nextid with DB to handle permission gaps or race conditions
      const pveNextVmid = await this.proxmox.getNextVmid()
      const lastVm = await this.prisma.vm.findFirst({
        where: { proxmoxVmid: { not: null } },
        orderBy: { proxmoxVmid: 'desc' },
        select: { proxmoxVmid: true },
      })
      const vmid = Math.max(pveNextVmid, (lastVm?.proxmoxVmid ?? 9999) + 1)
      step(`next vmid: ${vmid} (pve=${pveNextVmid} dbMax=${lastVm?.proxmoxVmid ?? 'none'})`)

      // Read NAT / network config from DB, fall back to env vars
      const [dbNatBridge, dbPublicBridge, dbNatNetwork, dbDnsPrimary, dbDnsSecondary] = await Promise.all([
        this.systemConfig.get('nat.bridge').catch(() => null),
        this.systemConfig.get('public.bridge').catch(() => null),
        this.systemConfig.get('nat.network').catch(() => null),
        this.systemConfig.get('nat.dns_primary').catch(() => null),
        this.systemConfig.get('nat.dns_secondary').catch(() => null),
      ])

      const natBridge    = dbNatBridge    || this.config.get('NAT_BRIDGE')    || 'vmbr1'
      const publicBridge = dbPublicBridge || this.config.get('PUBLIC_BRIDGE') || 'vmbr0'
      const natNetwork   = dbNatNetwork   || '10.20.0.0/24'
      const dnsPrimary   = dbDnsPrimary   || '1.1.1.1'
      const dnsSecondary = dbDnsSecondary || '8.8.8.8'

      const bridge = ipType === 'nat' ? natBridge : publicBridge
      step(`bridge: ${bridge}`)

      let ip: string | undefined
      let sshPort: number | undefined
      let ipconfig: string | undefined

      if (ipType === 'nat') {
        const { ip: allocIp, sshPort: allocPort } = await this.allocateNatIpAtomic(natNetwork)
        ip = allocIp
        sshPort = allocPort

        const { prefix, gateway } = parseCidr(natNetwork)
        const natGateway = (await this.systemConfig.get('nat.gateway').catch(() => null))
          || this.config.get('NAT_GATEWAY')
          || gateway

        ipconfig = `ip=${ip}/${prefix},gw=${natGateway}`
        step(`nat ip: ${ip} sshPort: ${sshPort}`)
        // Reserve IP in DB immediately so concurrent jobs don't get the same slot
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

        step('updateVmConfig hardware (cpu/ram/balloon/autostart)')
        await this.proxmox.updateVmConfig(node, vmid, {
          cores: pkg.vcpu,
          memory: Number(pkg.ramMb),
          balloon: 0,
          onboot: 1,
        })

        step('updateVmConfig vga → std')
        await this.proxmox.updateVmConfig(node, vmid, { vga: 'std' })
          .catch((e) => {
            const msg = e.response?.data?.message ?? e.response?.data?.errors ?? e.message
            this.logger.warn(`[${displayId}] vga config FAILED (check VM.Config.HWType permission on Proxmox token): ${msg}`)
          })

        step('updateVmConfig serial0 → socket')
        await this.proxmox.updateVmConfig(node, vmid, { serial0: 'socket' })
          .catch(() => {})

        // cloud-init + network config
        const configUpdate: Record<string, any> = {
          name: displayId,
          ciuser: 'root',
          cipassword: rootPassword,
        }
        if (ipconfig) configUpdate.ipconfig0 = ipconfig
        configUpdate.nameserver = [dnsPrimary, dnsSecondary].filter(Boolean).join(' ')
        if (bridge) configUpdate.net0 = `virtio,bridge=${bridge}`
        step(`updateVmConfig cloud-init: ipconfig=${ipconfig ?? 'none'} net0=${bridge ?? 'skip'}`)
        await this.proxmox.updateVmConfig(node, vmid, configUpdate)

        step('resizeDisk')
        try {
          const vmCfgForDisk = await this.proxmox.getVmConfig(node, vmid)
          const bootDisk = vmCfgForDisk.bootdisk
            ?? (['scsi0', 'virtio0', 'sata0', 'ide0'] as const).find(k => vmCfgForDisk[k])
            ?? 'scsi0'
          step(`resizeDisk: ${bootDisk} → ${pkg.diskGb}G`)
          await this.proxmox.resizeDisk(node, vmid, Number(pkg.diskGb), bootDisk)
        } catch (e: any) {
          this.logger.warn(`[${displayId}] Disk resize failed: ${e.response?.data?.errors ?? e.message}`)
        }
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
          step('agent ready — setHostname + MOTD via agent')
          await this.proxmox.setHostname(node, vmid, hostname).catch((e) => {
            this.logger.warn(`[${displayId}] setHostname via agent failed: ${e.message}`)
          })

          const brand = await this.systemConfig.getBrandConfig().catch(() => ({ name: 'NOVA' }))
          const domainBase = await this.systemConfig.get('domain.base').catch(() => '') ?? ''
          const panelUrl = domainBase ? `https://app.${domainBase.replace(/^https?:\/\//, '')}` : (this.config.get('FRONTEND_URL') ?? '')
          await this.vmMotd.writeToVm(node, vmid, brand.name || 'NOVA', panelUrl).catch((e) => {
            this.logger.warn(`[${displayId}] MOTD write failed: ${e.message}`)
          })
          const restrictedCmds = await this.vmMotd.getActiveCommands()
          await this.vmMotd.writeRestrictionsToVm(node, vmid, restrictedCmds).catch((e) => {
            this.logger.warn(`[${displayId}] Restrictions write failed: ${e.message}`)
          })
          const timezone = await this.systemConfig.get('brand.timezone').catch(() => null)
          await this.vmMotd.syncTimezoneToVm(node, vmid, timezone ?? 'Asia/Jakarta').catch((e) => {
            this.logger.warn(`[${displayId}] Timezone/NTP sync failed: ${e.message}`)
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

  private async allocateNatIpAtomic(natNetwork: string): Promise<{ ip: string; sshPort: number }> {
    const { networkNum, broadcastNum } = parseCidr(natNetwork)

    // Collect all used IPs and SSH ports from non-deleted VMs
    const vms = await this.prisma.vm.findMany({
      where: { status: { not: 'deleted' }, ipAddress: { not: null } },
      select: { ipAddress: true, sshPort: true },
    })
    const usedIps  = new Set(vms.map(v => v.ipAddress!))
    const usedPorts = new Set(vms.map(v => v.sshPort).filter(Boolean) as number[])

    // Additionally check natPortForward for any orphaned port reservations
    const forwards = await this.prisma.natPortForward.findMany({ select: { externalPort: true } })
    forwards.forEach(f => usedPorts.add(f.externalPort))

    // Find first free IP (skip network addr +0 and gateway +1)
    for (let ipNum = networkNum + 2; ipNum < broadcastNum; ipNum++) {
      const candidate = numToIp(ipNum)
      if (usedIps.has(candidate)) continue

      // Find next free SSH port starting from base
      const portBase = 22000
      let sshPort = portBase + 1
      while (usedPorts.has(sshPort) && sshPort < portBase + 10000) sshPort++
      if (sshPort >= portBase + 10000) throw new Error('Port SSH pool penuh')

      return { ip: candidate, sshPort }
    }
    throw new Error('NAT IP pool penuh')
  }
}
