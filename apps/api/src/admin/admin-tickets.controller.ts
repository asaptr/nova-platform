import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Controller('admin/tickets')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminTicketsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const where: any = {}
    if (status) where.status = status
    if (priority) where.priority = priority

    const skip = (+page - 1) * +limit
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          user: { select: { email: true, fullName: true } },
          vm: { select: { displayId: true, hostname: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: +limit,
      }),
      this.prisma.ticket.count({ where }),
    ])
    return { items, total }
  }

  @Get(':id')
  getTicket(@Param('id') id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        vm: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { message: string },
  ) {
    return this.prisma.ticketMessage.create({
      data: { ticketId: id, senderType: 'admin', senderId: adminId, message: body.message },
    })
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { status?: string; priority?: string; assignedTo?: string },
  ) {
    return this.prisma.ticket.update({
      where: { id },
      data: { ...body, updatedAt: new Date() },
    })
  }
}
