import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common'
import { VmsService } from './vms.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('vms')
@UseGuards(JwtAuthGuard)
export class VmsController {
  constructor(private vms: VmsService) {}

  @Get('packages')
  packages() {
    return this.vms.listPackages()
  }

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.vms.listVms(userId)
  }

  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() body: { packageId: string; osTemplate: string; hostname?: string; rootPassword: string },
  ) {
    return this.vms.createVm(userId, body.packageId, body.osTemplate, body.hostname, body.rootPassword)
  }

  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getVm(id, userId)
  }

  @Post(':id/start')
  start(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.startVm(id, userId)
  }

  @Post(':id/stop')
  stop(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.stopVm(id, userId)
  }

  @Post(':id/reboot')
  reboot(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.rebootVm(id, userId)
  }

  @Post(':id/console')
  console(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getConsole(id, userId)
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    return this.vms.resetPassword(id, userId, body.password)
  }
}
