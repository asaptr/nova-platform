import { Module } from '@nestjs/common'
import { BillingService } from './billing.service'
import { BillingController } from './billing.controller'
import { MikrotikModule } from '../mikrotik/mikrotik.module'
import { ProxmoxModule } from '../proxmox/proxmox.module'

@Module({
  imports: [MikrotikModule, ProxmoxModule],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
