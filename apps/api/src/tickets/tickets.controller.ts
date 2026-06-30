import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common'
import { TicketsService } from './tickets.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

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
    @Body() body: { subject: string; vmId?: string; priority?: string; firstMessage: string },
  ) {
    return this.tickets.createTicket(userId, body)
  }

  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.tickets.getTicket(id, userId)
  }

  @Post(':id/reply')
  reply(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    return this.tickets.replyToTicket(id, userId, body.message)
  }

  @Post(':id/close')
  close(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.tickets.closeTicket(id, userId)
  }
}
