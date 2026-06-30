import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ConfigService } from '@nestjs/config'
import { VmsService } from './vms.service'
import { VmsController } from './vms.controller'
import { ProvisionJob } from './vm-jobs/provision.job'
import { ProxmoxModule } from '../proxmox/proxmox.module'
import { MikrotikModule } from '../mikrotik/mikrotik.module'
import { DnsmasqModule } from '../dnsmasq/dnsmasq.module'

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
  ],
  providers: [VmsService, ProvisionJob],
  controllers: [VmsController],
  exports: [VmsService],
})
export class VmsModule {}
