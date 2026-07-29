import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { InAppNotificationService } from './in-app-notification.service'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notif: InAppNotificationService) {}

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.notif.getForUser(userId)
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('sub') userId: string) {
    const count = await this.notif.getUnreadCountForUser(userId)
    return { count }
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notif.markRead(id)
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notif.markAllReadForUser(userId)
  }
}
