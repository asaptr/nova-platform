import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './prisma/prisma.module'
import { ProxmoxModule } from './proxmox/proxmox.module'
import { MikrotikModule } from './mikrotik/mikrotik.module'
import { DnsmasqModule } from './dnsmasq/dnsmasq.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { VmsModule } from './vms/vms.module'
import { BillingModule } from './billing/billing.module'
import { PaymentModule } from './payment/payment.module'
import { AuditModule } from './audit/audit.module'
import { NotificationsModule } from './notifications/notifications.module'
import { TicketsModule } from './tickets/tickets.module'
import { AdminModule } from './admin/admin.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ProxmoxModule,
    MikrotikModule,
    DnsmasqModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    VmsModule,
    BillingModule,
    PaymentModule,
    TicketsModule,
    AdminModule,
  ],
})
export class AppModule {}
