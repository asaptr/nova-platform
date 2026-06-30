import { Module } from '@nestjs/common'
import { ProxmoxService } from './proxmox.service'

@Module({
  providers: [ProxmoxService],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
