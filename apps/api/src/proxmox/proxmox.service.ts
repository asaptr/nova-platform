import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import * as https from 'https'

@Injectable()
export class ProxmoxService {
  private client: AxiosInstance
  private readonly logger = new Logger(ProxmoxService.name)

  constructor(private config: ConfigService) {
    const rejectUnauthorized = config.get('PROXMOX_VERIFY_SSL') !== 'false'
    this.client = axios.create({
      baseURL: `https://${config.get('PROXMOX_HOST')}:${config.get('PROXMOX_PORT')}/api2/json`,
      headers: {
        Authorization: `PVEAPIToken=${config.get('PROXMOX_TOKEN_ID')}=${config.get('PROXMOX_TOKEN_SECRET')}`,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized }),
      timeout: 30_000,
    })
  }

  async getNodes() {
    const { data } = await this.client.get('/nodes')
    return data.data
  }

  async getNodeStatus(node: string) {
    const { data } = await this.client.get(`/nodes/${node}/status`)
    return data.data
  }

  async getNextVmid() {
    const { data } = await this.client.get('/cluster/nextid')
    return parseInt(data.data)
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

    const { data } = await this.client.post(`/nodes/${params.node}/qemu`, body)
    return data
  }

  async cloneVm(node: string, templateVmid: number, newVmid: number, name: string, storage?: string) {
    const body: Record<string, any> = { newid: newVmid, name, full: 1 }
    if (storage) body.storage = storage
    const { data } = await this.client.post(`/nodes/${node}/qemu/${templateVmid}/clone`, body)
    return data.data as string
  }

  async updateVmConfig(node: string, vmid: number, config: Record<string, any>) {
    const { data } = await this.client.put(`/nodes/${node}/qemu/${vmid}/config`, config)
    // Proxmox may return a UPID task (e.g. for cloud-init changes) — wait for it
    if (data?.data && typeof data.data === 'string' && data.data.startsWith('UPID:')) {
      await this.waitForTask(node, data.data)
    }
  }

  async createVmRaw(node: string, body: Record<string, any>) {
    const { data } = await this.client.post(`/nodes/${node}/qemu`, body)
    return data
  }

  async resizeDisk(node: string, vmid: number, diskGb: number) {
    await this.client.put(`/nodes/${node}/qemu/${vmid}/resize`, {
      disk: 'scsi0',
      size: `${diskGb}G`,
    })
  }

  async startVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/start`)
    // start returns a UPID — wait for it to confirm VM actually started
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async stopVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/stop`)
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async shutdownVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/shutdown`)
    return data
  }

  async rebootVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/reboot`)
    return data
  }

  async suspendVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/suspend`)
    return data
  }

  async resumeVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/resume`)
    return data
  }

  async deleteVm(node: string, vmid: number) {
    const { data } = await this.client.delete(`/nodes/${node}/qemu/${vmid}`, { params: { purge: 1 } })
    if (data?.data && typeof data.data === 'string') {
      await this.waitForTask(node, data.data)
    }
    return data
  }

  async getVmStatus(node: string, vmid: number) {
    const { data } = await this.client.get(`/nodes/${node}/qemu/${vmid}/status/current`)
    return data.data
  }

  async getVmConfig(node: string, vmid: number) {
    const { data } = await this.client.get(`/nodes/${node}/qemu/${vmid}/config`)
    return data.data
  }

  async setRootPassword(node: string, vmid: number, password: string) {
    try {
      const { data } = await this.client.post(
        `/nodes/${node}/qemu/${vmid}/agent/set-user-password`,
        { username: 'root', password },
      )
      return data
    } catch (e: any) {
      // Fallback: use agent exec with chpasswd (also requires agent, but different codepath)
      const status = e?.response?.status
      if (status === 500 || status === 400) {
        const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
          command: ['bash', '-c', `echo "root:${password}" | chpasswd`],
        })
        return data
      }
      throw e
    }
  }

  async setHostname(node: string, vmid: number, hostname: string) {
    await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command: ['hostnamectl', 'set-hostname', hostname],
    })
    await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command: ['bash', '-c', `echo "127.0.1.1 ${hostname}" >> /etc/hosts`],
    })
  }

  async createVncTicket(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/vncproxy`)
    return data.data
  }

  async getVmTaskLog(node: string, vmid: number) {
    const { data } = await this.client.get(`/nodes/${node}/qemu/${vmid}/tasklog`)
    return data.data
  }

  async waitForAgent(node: string, vmid: number, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await this.client.get(`/nodes/${node}/qemu/${vmid}/agent/info`)
        return
      } catch {
        await new Promise(r => setTimeout(r, 5_000))
      }
    }
    throw new Error(`QEMU agent VM ${vmid} tidak ready dalam ${timeoutMs / 1000}s`)
  }

  async listVms(node: string) {
    const { data } = await this.client.get(`/nodes/${node}/qemu`)
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
    const { data: storageRes } = await this.client.get(`/nodes/${node}/storage`)
    const storages = (storageRes.data as any[]).filter(s =>
      s.content?.split(',').includes('iso') && s.active === 1,
    )
    const results = await Promise.allSettled(
      storages.map(async (s) => {
        const { data } = await this.client.get(
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

  async waitForTask(node: string, upid: string, timeoutMs = 300_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const { data } = await this.client.get(`/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`)
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
