import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SystemConfigService } from '../system-config/system-config.service'
import axios, { AxiosInstance } from 'axios'
import * as https from 'https'

@Injectable()
export class ProxmoxService {
  private readonly logger = new Logger(ProxmoxService.name)
  private cachedClient: { instance: AxiosInstance; expiresAt: number } | null = null
  private pveSession: { cookie: string; csrf: string; expiresAt: number } | null = null

  constructor(
    private config: ConfigService,
    private systemConfig: SystemConfigService,
  ) {}

  private async getClient(): Promise<AxiosInstance> {
    if (this.cachedClient && Date.now() < this.cachedClient.expiresAt) {
      return this.cachedClient.instance
    }

    let dbHost: string | null = null, dbPort: string | null = null
    let dbTokenId: string | null = null, dbTokenSecret: string | null = null
    let dbVerifySsl: string | null = null

    try {
      ;[dbHost, dbPort, dbTokenId, dbTokenSecret, dbVerifySsl] = await Promise.all([
        this.systemConfig.get('proxmox.host'),
        this.systemConfig.get('proxmox.port'),
        this.systemConfig.get('proxmox.token_id'),
        this.systemConfig.get('proxmox.token_secret'),
        this.systemConfig.get('proxmox.verify_ssl'),
      ])
    } catch {
      // DB not ready yet — fall back to env vars only
    }

    const host      = dbHost       || this.config.get('PROXMOX_HOST')          || ''
    const port      = dbPort       || this.config.get('PROXMOX_PORT')          || '8006'
    const tokenId   = dbTokenId    || this.config.get('PROXMOX_TOKEN_ID')      || ''
    const tokenSec  = dbTokenSecret|| this.config.get('PROXMOX_TOKEN_SECRET')  || ''
    const verifySsl = dbVerifySsl  || this.config.get('PROXMOX_VERIFY_SSL')    || 'false'

    const instance = axios.create({
      baseURL: `https://${host}:${port}/api2/json`,
      headers: { Authorization: `PVEAPIToken=${tokenId}=${tokenSec}` },
      httpsAgent: new https.Agent({ rejectUnauthorized: verifySsl !== 'false' }),
      timeout: 30_000,
    })

    this.cachedClient = { instance, expiresAt: Date.now() + 60_000 }
    return instance
  }

  // Returns a PVE user session (cookie + CSRF token) from root@pam password auth.
  // Termproxy WS requires this — API token auth causes ticket validation mismatch.
  async getPveSession(): Promise<{ cookie: string; csrf: string }> {
    if (this.pveSession && Date.now() < this.pveSession.expiresAt) {
      return { cookie: this.pveSession.cookie, csrf: this.pveSession.csrf }
    }

    const host = this.config.get('PROXMOX_HOST') || ''
    const port = this.config.get('PROXMOX_PORT') || '8006'
    const user = (this.config.get('PROXMOX_SSH_USER') || 'root') + '@pam'
    const pass = this.config.get('PROXMOX_SSH_PASSWORD') || ''

    const { data } = await axios.post(
      `https://${host}:${port}/api2/json/access/ticket`,
      new URLSearchParams({ username: user, password: pass }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      },
    )

    const cookie = data.data.ticket as string
    const csrf   = data.data.CSRFPreventionToken as string
    this.pveSession = { cookie, csrf, expiresAt: Date.now() + 90 * 60 * 1000 }
    this.logger.log(`PVE session obtained for ${user}`)
    return { cookie, csrf }
  }

  async getNodes() {
    const c = await this.getClient()
    const { data } = await c.get('/nodes')
    return data.data
  }

  async getNodeStatus(node: string) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/status`)
    return data.data
  }

  async getNextVmid(minVmid = 10000) {
    const c = await this.getClient()

    // Try PVE /cluster/nextid — only trust if it returns strictly greater than minVmid,
    // because returning exactly minVmid often means the API token lacks Sys.Audit and
    // PVE can't check existing VMIDs.
    try {
      const { data } = await c.get(`/cluster/nextid?vmid=${minVmid}`)
      const vmid = parseInt(data.data)
      if (!isNaN(vmid) && vmid > minVmid) return vmid
    } catch {}

    // Fallback: scan all nodes for actual VMIDs and return max + 1
    try {
      const nodes = await this.getNodes()
      let maxVmid = minVmid - 1
      for (const node of nodes) {
        try {
          const vms = await this.listVms(node.node)
          for (const vm of vms) {
            const id = parseInt(vm.vmid)
            if (!isNaN(id)) maxVmid = Math.max(maxVmid, id)
          }
        } catch {}
      }
      return maxVmid + 1
    } catch {}

    return minVmid
  }

  async createVm(params: {
    node: string
    vmid: number
    name: string
    cores: number
    memoryMb: number
    diskGb: number
    bridge: string
    osTemplate: string
    ipconfig?: string
  }) {
    const c = await this.getClient()
    const body: Record<string, any> = {
      vmid: params.vmid,
      name: params.name,
      cores: params.cores,
      memory: params.memoryMb,
      net0: `virtio,bridge=${params.bridge}`,
      ostype: 'l26',
      scsi0: `local-lvm:${params.diskGb}`,
      scsihw: 'virtio-scsi-pci',
      boot: 'order=scsi0',
      agent: 'enabled=1',
      vga: 'std',
    }

    if (params.osTemplate) {
      body.ide2 = `${params.osTemplate},media=cdrom`
    }

    if (params.ipconfig) {
      body.ipconfig0 = params.ipconfig
    }

    const { data } = await c.post(`/nodes/${params.node}/qemu`, body)
    return data
  }

  async cloneVm(node: string, templateVmid: number, newVmid: number, name: string, storage?: string) {
    const c = await this.getClient()
    const body: Record<string, any> = { newid: newVmid, name, full: 1 }
    if (storage) body.storage = storage
    const { data } = await c.post(`/nodes/${node}/qemu/${templateVmid}/clone`, body)
    return data.data as string
  }

  async updateVmConfig(node: string, vmid: number, config: Record<string, any>) {
    const c = await this.getClient()
    const { data } = await c.put(`/nodes/${node}/qemu/${vmid}/config`, config)
    if (data?.data && typeof data.data === 'string' && data.data.startsWith('UPID:')) {
      await this.waitForTask(node, data.data)
    }
  }

  async createVmRaw(node: string, body: Record<string, any>) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu`, body)
    return data
  }

  async resizeDisk(node: string, vmid: number, diskGb: number, disk = 'scsi0') {
    const c = await this.getClient()
    await c.put(`/nodes/${node}/qemu/${vmid}/resize`, { disk, size: `${diskGb}G` })
  }

  async startVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/start`)
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async stopVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/stop`)
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async shutdownVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/shutdown`)
    if (data?.data && typeof data.data === 'string') {
      try {
        await this.waitForTask(node, data.data, 30_000)
      } catch {
        this.logger.warn(`Graceful shutdown timed out for VM ${vmid}, forcing stop`)
        await this.stopVm(node, vmid)
      }
    }
    return data
  }

  async rebootVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/reboot`)
    return data
  }

  async suspendVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/suspend`)
    return data
  }

  async resumeVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/status/resume`)
    return data
  }

  async deleteVm(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.delete(`/nodes/${node}/qemu/${vmid}`, { params: { purge: 1 } })
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async getVmStatus(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/qemu/${vmid}/status/current`)
    return data.data
  }

  async getVmConfig(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/qemu/${vmid}/config`)
    return data.data
  }

  async setRootPassword(node: string, vmid: number, password: string) {
    const c = await this.getClient()
    try {
      const { data } = await c.post(
        `/nodes/${node}/qemu/${vmid}/agent/set-user-password`,
        { username: 'root', password },
      )
      return data
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 500 || status === 400) {
        const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
          command: ['bash', '-c', `echo "root:${password}" | chpasswd`],
        })
        return data
      }
      throw e
    }
  }

  async setHostname(node: string, vmid: number, hostname: string) {
    const c = await this.getClient()
    await c.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command: ['hostnamectl', 'set-hostname', hostname],
    })
    await c.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command: ['bash', '-c', `echo "127.0.1.1 ${hostname}" >> /etc/hosts`],
    })
  }

  async agentExec(node: string, vmid: number, command: string[]) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, { command })
    return data.data
  }

  async createVncTicket(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.post(`/nodes/${node}/qemu/${vmid}/vncproxy`, { websocket: 1 })
    return data.data
  }

  async createTermProxy(node: string, vmid: number, vmType: 'qemu' | 'lxc' = 'qemu') {
    const { cookie, csrf } = await this.getPveSession()
    const host = this.config.get('PROXMOX_HOST') || ''
    const port = this.config.get('PROXMOX_PORT') || '8006'
    const { data } = await axios.post(
      `https://${host}:${port}/api2/json/nodes/${node}/${vmType}/${vmid}/termproxy`,
      {},
      {
        headers: {
          Cookie: `PVEAuthCookie=${cookie}`,
          CSRFPreventionToken: csrf,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      },
    )
    return data.data as { ticket: string; port: string; upid: string; user: string }
  }

  async getVmTaskLog(node: string, vmid: number) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/qemu/${vmid}/tasklog`)
    return data.data
  }

  async waitForAgent(node: string, vmid: number, timeoutMs = 120_000): Promise<void> {
    const c = await this.getClient()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await c.get(`/nodes/${node}/qemu/${vmid}/agent/info`)
        return
      } catch {
        await new Promise(r => setTimeout(r, 5_000))
      }
    }
    throw new Error(`QEMU agent VM ${vmid} tidak ready dalam ${timeoutMs / 1000}s`)
  }

  async listVms(node: string) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/qemu`)
    return (data.data as any[])
      .sort((a, b) => a.vmid - b.vmid)
      .map(vm => ({
        vmid: String(vm.vmid),
        name: vm.name ?? `VM ${vm.vmid}`,
        status: vm.status,
        isTemplate: vm.template === 1,
      }))
  }

  async listStorageIsos(node: string) {
    const c = await this.getClient()
    const { data: storageRes } = await c.get(`/nodes/${node}/storage`)
    const storages = (storageRes.data as any[]).filter(s =>
      s.content?.split(',').includes('iso') && s.active === 1,
    )
    const results = await Promise.allSettled(
      storages.map(async (s) => {
        const { data } = await c.get(
          `/nodes/${node}/storage/${s.storage}/content`,
          { params: { content: 'iso' } },
        )
        return (data.data as any[]).map(item => ({
          volid: item.volid,
          name: item.volid.split('/').pop(),
          storage: s.storage,
          size: item.size,
        }))
      }),
    )
    return results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
  }

  async listBridges(node: string) {
    const c = await this.getClient()
    const { data } = await c.get(`/nodes/${node}/network`, { params: { type: 'bridge' } })
    return (data.data as any[]).map((n: any) => ({
      iface: n.iface,
      active: n.active === 1,
      autostart: n.autostart === 1,
      bridgePorts: n.bridge_ports ?? '',
      address: n.address ?? null,
    }))
  }

  async createBridge(node: string, iface: string, bridgePorts = '', address?: string, netmask?: string) {
    const c = await this.getClient()
    const body: Record<string, any> = {
      iface,
      type: 'bridge',
      autostart: 1,
      bridge_ports: bridgePorts,
    }
    if (address) body.address = address
    if (netmask) body.netmask = netmask
    await c.post(`/nodes/${node}/network`, body)
    await c.put(`/nodes/${node}/network`)
  }

  async updateBridgeAddress(node: string, iface: string, address: string, netmask: string) {
    const c = await this.getClient()
    // GET current config first to preserve existing fields (bridge_ports, etc.)
    const { data: current } = await c.get(`/nodes/${node}/network/${iface}`)
    const existing = current?.data ?? {}
    await c.put(`/nodes/${node}/network/${iface}`, {
      type: existing.type ?? 'bridge',
      address,
      netmask,
      ...(existing.bridge_ports !== undefined && { bridge_ports: existing.bridge_ports }),
    })
    await c.put(`/nodes/${node}/network`)  // apply pending changes
  }

  async waitForTask(node: string, upid: string, timeoutMs = 300_000): Promise<void> {
    const c = await this.getClient()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const { data } = await c.get(`/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`)
      if (data.data.status === 'stopped') {
        if (data.data.exitstatus !== 'OK') {
          throw new Error(`Task ${upid} failed: ${data.data.exitstatus}`)
        }
        return
      }
      await new Promise(r => setTimeout(r, 3_000))
    }
    throw new Error(`Task ${upid} timeout`)
  }
}
