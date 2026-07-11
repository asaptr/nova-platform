import { Module } from '@nestjs/common'
import { ProxmoxService } from './proxmox.service'
import { ProxmoxSshService } from './proxmox-ssh.service'
import { SystemConfigModule } from '../system-config/system-config.module'

@Module({
  imports: [SystemConfigModule],
  providers: [ProxmoxService, ProxmoxSshService],
  exports: [ProxmoxService, ProxmoxSshService],
})
export class ProxmoxModule {}
