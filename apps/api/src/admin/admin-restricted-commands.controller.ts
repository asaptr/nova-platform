import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { VmMotdService } from '../vms/vm-motd.service'

const DEFAULT_COMMANDS = [
  { command: 'shutdown',  description: 'Matikan sistem' },
  { command: 'reboot',    description: 'Restart sistem' },
  { command: 'poweroff',  description: 'Matikan daya' },
  { command: 'halt',      description: 'Hentikan sistem' },
  { command: 'init',      description: 'Ubah runlevel' },
  { command: 'telinit',   description: 'Ubah runlevel (alias init)' },
]

@Controller('admin/restricted-commands')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminRestrictedCommandsController {
  constructor(
    private prisma: PrismaService,
    private vmMotd: VmMotdService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.restrictedCommand.findMany({ orderBy: { command: 'asc' } })
    // Seed defaults if table is empty
    if (rows.length === 0) {
      await this.prisma.restrictedCommand.createMany({
        data: DEFAULT_COMMANDS.map(d => ({ ...d, isActive: true })),
        skipDuplicates: true,
      })
      return this.prisma.restrictedCommand.findMany({ orderBy: { command: 'asc' } })
    }
    return rows
  }

  @Post()
  @Roles('superadmin')
  create(@Body() body: { command: string; description?: string }) {
    return this.prisma.restrictedCommand.create({
      data: {
        command: body.command.trim().toLowerCase(),
        description: body.description,
        isActive: true,
      },
    })
  }

  @Patch(':id')
  @Roles('superadmin')
  update(
    @Param('id') id: string,
    @Body() body: { command?: string; description?: string; isActive?: boolean },
  ) {
    return this.prisma.restrictedCommand.update({
      where: { id },
      data: body,
    })
  }

  @Delete(':id')
  @Roles('superadmin')
  remove(@Param('id') id: string) {
    return this.prisma.restrictedCommand.delete({ where: { id } })
  }

  @Post('push-all')
  @Roles('superadmin')
  async pushAll() {
    const result = await this.vmMotd.pushRestrictionsToAllRunning()
    return { message: `Pushed to ${result.pushed} VM(s), ${result.failed} failed`, ...result }
  }
}
