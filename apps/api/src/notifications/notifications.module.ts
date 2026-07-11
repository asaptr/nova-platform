import { Global, Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { InAppNotificationService } from './in-app-notification.service'
import { NotificationsController } from './notifications.controller'

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, InAppNotificationService],
  exports: [NotificationsService, InAppNotificationService],
})
export class NotificationsModule {}
