import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async createTicket(userId: string, data: { subject: string; vmId?: string; priority?: string; firstMessage: string }) {
    const ticket = await this.prisma.ticket.create({
      data: {
        userId,
        vmId: data.vmId,
        subject: data.subject,
        priority: data.priority ?? 'normal',
        messages: {
          create: {
            senderType: 'user',
            senderId: userId,
            message: data.firstMessage,
          },
        },
      },
      include: { messages: true },
    })
    return ticket
  }

  async listTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
  }

  async getTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, vm: true },
    })
    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan')
    if (ticket.userId !== userId) throw new ForbiddenException()
    return ticket
  }

  async replyToTicket(ticketId: string, userId: string, message: string, attachmentUrl?: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!ticket) throw new NotFoundException()
    if (ticket.userId !== userId) throw new ForbiddenException()
    if (ticket.status === 'closed') throw new BadRequestException('Tiket sudah ditutup')

    const lastMsg = ticket.messages[0]
    if (!lastMsg || lastMsg.senderType === 'user') {
      throw new BadRequestException('Tunggu balasan admin sebelum mengirim pesan baru')
    }

    const msg = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderType: 'user',
        senderId: userId,
        message: message.trim(),
        attachmentUrl,
      },
    })

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: ticket.status === 'resolved' ? 'open' : ticket.status, updatedAt: new Date() },
    })

    return msg
  }

  async closeTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) throw new NotFoundException()
    if (ticket.userId !== userId) throw new ForbiddenException()
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { status: 'closed' } })
  }
}
