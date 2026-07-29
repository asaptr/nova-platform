import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { InAppNotificationService } from '../notifications/in-app-notification.service'

const uploadDir = join(process.cwd(), 'uploads', 'tickets')

@Controller('admin/tickets')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminTicketsController {
  constructor(
    private prisma: PrismaService,
    private inAppNotif: InAppNotificationService,
  ) {}

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
  @UseInterceptors(FileInterceptor('attachment', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })
        cb(null, uploadDir)
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`)
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
      cb(null, allowed.includes(extname(file.originalname).toLowerCase()))
    },
  }))
  async reply(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body('message') message: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const attachmentUrl = file ? `/uploads/tickets/${file.filename}` : undefined

    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { userId: true, subject: true },
    })

    const msg = await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        senderType: 'admin',
        senderId: adminId,
        message: message ?? '',
        attachmentUrl,
      },
    })

    if (ticket) {
      await this.inAppNotif.createForUser(
        ticket.userId,
        'ticket_reply_admin',
        'Admin Membalas Tiket Anda',
        `Tiket "${ticket.subject}" mendapat balasan dari admin.`,
        `/support/${id}`,
      )
    }

    return msg
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
