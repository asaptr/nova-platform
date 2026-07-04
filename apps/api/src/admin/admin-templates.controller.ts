import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Controller('admin/templates')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminTemplatesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.vmTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  }

  @Post()
  @Roles('superadmin')
  create(@Body() body: { name: string; description?: string; osFamily?: string; proxmoxValue: string; sortOrder?: number }) {
    return this.prisma.vmTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        osFamily: body.osFamily ?? 'linux',
        proxmoxValue: body.proxmoxValue,
        sortOrder: body.sortOrder ?? 0,
        isActive: true,
      },
    })
  }

  @Patch(':id')
  @Roles('superadmin')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; osFamily?: string; proxmoxValue?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.prisma.vmTemplate.update({ where: { id }, data: body })
  }

  @Delete(':id')
  @Roles('superadmin')
  remove(@Param('id') id: string) {
    return this.prisma.vmTemplate.delete({ where: { id } })
  }
}
