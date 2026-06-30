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
      serial0: 'socket',
      vga: 'serial0',
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

  async cloneVm(node: string, templateVmid: number, newVmid: number, name: string, diskGb: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${templateVmid}/clone`, {
      newid: newVmid,
      name,
      full: 1,
      storage: 'local-lvm',
    })
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
    return data
  }

  async stopVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/stop`)
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
    const { data } = await this.client.delete(`/nodes/${node}/qemu/${vmid}`)
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
    const { data } = await this.client.post(
      `/nodes/${node}/qemu/${vmid}/agent/set-user-password`,
      { username: 'root', password },
    )
    return data
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
