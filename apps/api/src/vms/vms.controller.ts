import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { VmsService } from './vms.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('vms')
export class VmsController {
  constructor(private vms: VmsService) {}

  // Public — dipakai landing page (pricing) dan halaman create VM
  @Get('packages')
  packages() {
    return this.vms.listPackages()
  }

  @Get('templates')
  templates() {
    return this.vms.listTemplates()
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.vms.listVms(userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() body: { packageId: string; osTemplate: string; hostname?: string; rootPassword: string },
  ) {
    return this.vms.createVm(userId, body.packageId, body.osTemplate, body.hostname, body.rootPassword)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getVm(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  start(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.startVm(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/stop')
  stop(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.stopVm(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reboot')
  reboot(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.rebootVm(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/console')
  console(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getConsole(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/terminal')
  terminal(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getTerminal(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.deleteVm(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/logs')
  logs(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getVmLogs(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/stats')
  stats(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.vms.getVmStats(id, userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    return this.vms.resetPassword(id, userId, body.password)
  }
}
