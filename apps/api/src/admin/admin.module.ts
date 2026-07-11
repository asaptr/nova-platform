import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { AdminAuthService } from './admin-auth.service'
import { AdminAuthController } from './admin-auth.controller'
import { AdminVmsController } from './admin-vms.controller'
import { AdminFinanceController } from './admin-finance.controller'
import { AdminUsersController } from './admin-users.controller'
import { AdminTicketsController } from './admin-tickets.controller'
import { AdminNodesController } from './admin-nodes.controller'
import { AdminPackagesController } from './admin-packages.controller'
import { AdminTemplatesController } from './admin-templates.controller'
import { AdminProxmoxController } from './admin-proxmox.controller'
import { AdminSettingsController } from './admin-settings.controller'
import { AdminNetworkController } from './admin-network.controller'
import { AdminNotificationsController } from './admin-notifications.controller'
import { AdminJwtStrategy } from './admin-jwt.strategy'
import { ProxmoxModule } from '../proxmox/proxmox.module'
import { MikrotikModule } from '../mikrotik/mikrotik.module'
import { SystemConfigModule } from '../system-config/system-config.module'
import { VmsModule } from '../vms/vms.module'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('ADMIN_JWT_SECRET'),
      }),
    }),
    ProxmoxModule,
    MikrotikModule,
    SystemConfigModule,
    VmsModule,
  ],
  providers: [AdminAuthService, AdminJwtStrategy, RolesGuard],
  controllers: [
    AdminAuthController,
    AdminVmsController,
    AdminFinanceController,
    AdminUsersController,
    AdminTicketsController,
    AdminNodesController,
    AdminPackagesController,
    AdminTemplatesController,
    AdminProxmoxController,
    AdminSettingsController,
    AdminNetworkController,
    AdminNotificationsController,
  ],
})
export class AdminModule {}
