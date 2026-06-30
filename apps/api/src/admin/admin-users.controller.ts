import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'

@Controller('admin/users')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminUsersController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const where: any = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const skip = (+page - 1) * +limit
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, email: true, fullName: true, phone: true, status: true, balance: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: +limit,
      }),
      this.prisma.user.count({ where }),
    ])
    return { items, total, page: +page, limit: +limit }
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const [user, vms, transactions, auditLogs] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, fullName: true, phone: true, status: true, balance: true, createdAt: true },
      }),
      this.prisma.vm.findMany({ where: { userId: id }, include: { package: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.auditLog.findMany({ where: { actorId: id, actorType: 'user' }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ])
    return { user, vms, transactions, auditLogs }
  }

  @Patch(':id/status')
  @Roles('superadmin')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { status: 'active' | 'suspended' | 'banned'; reason?: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, email: true, status: true },
    })
    await this.audit.log({
      actorType: 'admin', actorId: adminId,
      action: `user.${body.status}`,
      resourceType: 'user', resourceId: id,
      metadata: { reason: body.reason },
    })
    return user
  }
}
