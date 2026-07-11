import { Controller, Get, Put, Post, Body, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { SystemConfigService } from '../system-config/system-config.service'
import { AuditService } from '../audit/audit.service'
import { VmMotdService } from '../vms/vm-motd.service'

@Controller('admin/settings')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('superadmin')
export class AdminSettingsController {
  constructor(
    private systemConfig: SystemConfigService,
    private audit: AuditService,
    private vmMotd: VmMotdService,
  ) {}

  @Get()
  async getAll() {
    return this.systemConfig.getAll()
  }

  @Put()
  async updateAll(
    @Body() body: Record<string, string>,
    @CurrentUser('sub') adminId: string,
  ) {
    const toSave: Record<string, string> = {}
    for (const [key, value] of Object.entries(body)) {
      // Skip masked placeholder — means field was not changed
      if (this.systemConfig.isMasked(value)) continue
      toSave[key] = value
    }
    if (Object.keys(toSave).length > 0) {
      await this.systemConfig.setMany(toSave, adminId)
      await this.audit.log({
        actorType: 'admin',
        actorId: adminId,
        action: 'settings.update',
        resourceType: 'system_config',
        metadata: { keys: Object.keys(toSave) },
      })

      // Sync MOTD to all running VMs if brand or domain changed
      if ('brand.name' in toSave || 'domain.base' in toSave) {
        const brand = await this.systemConfig.getBrandConfig()
        const domainBase = await this.systemConfig.get('domain.base') ?? ''
        const panelUrl = domainBase ? `https://app.${domainBase.replace(/^https?:\/\//, '')}` : ''
        this.vmMotd.syncAllRunning(brand.name || 'NOVA', panelUrl)
      }
    }
    return { message: 'Pengaturan berhasil disimpan' }
  }

  @Post('push-restrictions')
  async pushRestrictions() {
    this.vmMotd.pushRestrictionsToAllRunning()
    return { message: 'Mengirim console restrictions ke semua VM yang running...' }
  }

  @Post('sync-motd')
  async syncMotd() {
    const brand = await this.systemConfig.getBrandConfig()
    const domainBase = await this.systemConfig.get('domain.base') ?? ''
    const panelUrl = domainBase ? `https://app.${domainBase.replace(/^https?:\/\//, '')}` : ''
    this.vmMotd.syncAllRunning(brand.name || 'NOVA', panelUrl)
    return { message: 'Mengirim MOTD & issue banner ke semua VM yang running...' }
  }

  @Post('fix-vga')
  async fixVga() {
    this.vmMotd.fixVgaAllVms()
    return { message: 'Memperbarui display config ke Standard VGA untuk semua VM. Stop → Start setiap VM agar efek.' }
  }
}
