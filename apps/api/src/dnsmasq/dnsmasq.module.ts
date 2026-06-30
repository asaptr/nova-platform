import { Module } from '@nestjs/common'
import { DnsmasqService } from './dnsmasq.service'

@Module({
  providers: [DnsmasqService],
  exports: [DnsmasqService],
})
export class DnsmasqModule {}
