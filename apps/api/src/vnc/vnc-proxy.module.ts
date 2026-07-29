import { Module } from '@nestjs/common'
import { VncProxyService } from './vnc-proxy.service'
import { PrismaModule } from '../prisma/prisma.module'
import { ProxmoxModule } from '../proxmox/proxmox.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [PrismaModule, ProxmoxModule, AuthModule],
  providers: [VncProxyService],
  exports: [VncProxyService],
})
export class VncProxyModule {}
