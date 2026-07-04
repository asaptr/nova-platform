import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { SystemConfigService } from '../system-config/system-config.service'
import { AuditService } from '../audit/audit.service'

@Controller('admin/settings')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('superadmin')
export class AdminSettingsController {
  constructor(
    private systemConfig: SystemConfigService,
    private audit: AuditService,
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
    }
    return { message: 'Pengaturan berhasil disimpan' }
  }
}
