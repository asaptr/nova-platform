import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { ConfigService } from '@nestjs/config'

@Controller('admin/proxmox')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminProxmoxController {
  constructor(
    private proxmox: ProxmoxService,
    private config: ConfigService,
  ) {}

  @Get('resources')
  async resources() {
    const node = this.config.get('PROXMOX_NODE')
    const [vms, isos] = await Promise.all([
      this.proxmox.listVms(node),
      this.proxmox.listStorageIsos(node),
    ])
    return { vms, isos }
  }

  @Get('test-clone/:vmid')
  async testClone(@Param('vmid') vmid: string) {
    const node = this.config.get('PROXMOX_NODE')
    try {
      const nextId = await this.proxmox.getNextVmid()
      // Dry-run: clone then immediately delete the test clone
      const upid = await this.proxmox.cloneVm(node, Number(vmid), nextId, 'test-clone-delete-me')
      return { ok: true, upid, newVmid: nextId, message: 'Clone berhasil! Hapus VM test-clone-delete-me di Proxmox.' }
    } catch (e: any) {
      return {
        ok: false,
        status: e?.response?.status,
        error: e?.response?.data ?? e.message,
        hint: e?.response?.status === 403
          ? 'Token tidak punya permission VM.Clone. Cek Proxmox → Datacenter → Permissions → API Token Permission untuk token API Anda'
          : 'Cek koneksi Proxmox',
      }
    }
  }
}
