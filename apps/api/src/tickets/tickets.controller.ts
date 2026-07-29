import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { TicketsService } from './tickets.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

const uploadDir = join(process.cwd(), 'uploads', 'tickets')

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.tickets.listTickets(userId)
  }

  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() body: { subject: string; firstMessage: string; vmId?: string; priority?: string },
  ) {
    return this.tickets.createTicket(userId, body)
  }

  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.tickets.getTicket(id, userId)
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
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body('message') message: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!message?.trim() && !file) throw new BadRequestException('Pesan atau lampiran wajib ada')
    const attachmentUrl = file ? `/uploads/tickets/${file.filename}` : undefined
    return this.tickets.replyToTicket(id, userId, message ?? '', attachmentUrl)
  }

  @Patch(':id/close')
  close(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.tickets.closeTicket(id, userId)
  }
}
