import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { InAppNotificationService } from '../notifications/in-app-notification.service'

@Controller('admin/notifications')
@UseGuards(AdminJwtGuard)
export class AdminNotificationsController {
  constructor(private readonly notif: InAppNotificationService) {}

  @Get()
  list() {
    return this.notif.getForAdmins()
  }

  @Get('unread-count')
  async unreadCount() {
    const count = await this.notif.getAdminUnreadCount()
    return { count }
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notif.markRead(id)
  }

  @Patch('read-all')
  markAllRead() {
    return this.notif.markAllReadForAdmins()
  }
}
