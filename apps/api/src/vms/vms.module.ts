import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ConfigService } from '@nestjs/config'
import { VmsService } from './vms.service'
import { VmsController } from './vms.controller'
import { ProvisionJob } from './vm-jobs/provision.job'
import { VmStatusSyncJob } from './vm-jobs/vm-status-sync.job'
import { VmMotdService } from './vm-motd.service'
import { ProxmoxModule } from '../proxmox/proxmox.module'
import { MikrotikModule } from '../mikrotik/mikrotik.module'
import { DnsmasqModule } from '../dnsmasq/dnsmasq.module'
import { SystemConfigModule } from '../system-config/system-config.module'

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST'),
          port: +config.get('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'vm-provision' }),
    ProxmoxModule,
    MikrotikModule,
    DnsmasqModule,
    SystemConfigModule,
  ],
  providers: [VmsService, ProvisionJob, VmMotdService, VmStatusSyncJob],
  controllers: [VmsController],
  exports: [VmsService, VmMotdService],
})
export class VmsModule {}
