import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Controller('admin/packages')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('superadmin')
export class AdminPackagesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.package.findMany({ orderBy: [{ ipType: 'asc' }, { priceMonthly: 'asc' }] })
  }

  @Post()
  create(@Body() body: {
    name: string; ipType: string; vcpu: number; ramMb: number;
    diskGb: number; bandwidthGb: number; priceMonthly: number; priceHourly: number
  }) {
    return this.prisma.package.create({ data: body })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<any>) {
    return this.prisma.package.update({ where: { id }, data: body })
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.package.update({ where: { id }, data: { isActive: false } })
  }
}
