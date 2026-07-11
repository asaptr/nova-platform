import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { ProxmoxService } from '../../proxmox/proxmox.service'
import { SystemConfigService } from '../../system-config/system-config.service'

@Injectable()
export class VmStatusSyncJob {
  private readonly logger = new Logger(VmStatusSyncJob.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxmox: ProxmoxService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  @Cron('*/60 * * * * *')
  async syncVmStatuses() {
    try {
      const nodeCfg = await this.systemConfig.get('proxmox.node')
      const nodes = nodeCfg ? [nodeCfg] : (await this.proxmox.getNodes()).map((n: any) => n.node)

      const proxmoxVms = (
        await Promise.allSettled(nodes.map((node: string) => this.proxmox.listVms(node)))
      )
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
        .flatMap(r => r.value)

      if (proxmoxVms.length === 0) return

      const vmidToStatus = new Map<string, string>(
        proxmoxVms.map(v => [String(v.vmid), v.status]),
      )

      const dbVms = await this.prisma.vm.findMany({
        where: {
          proxmoxVmid: { not: null },
          status: { notIn: ['pending', 'provisioning', 'deleted'] },
        },
        select: { id: true, proxmoxVmid: true, status: true },
      })

      const updates: Promise<any>[] = []
      for (const vm of dbVms) {
        const proxmoxStatus = vmidToStatus.get(String(vm.proxmoxVmid))
        if (!proxmoxStatus) continue
        const normalized = proxmoxStatus === 'running' ? 'running' : 'stopped'
        if (vm.status !== normalized) {
          updates.push(
            this.prisma.vm.update({
              where: { id: vm.id },
              data: { status: normalized },
            }),
          )
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates)
        this.logger.log(`Synced status for ${updates.length} VM(s)`)
      }
    } catch (err) {
      this.logger.warn(`VM status sync failed: ${err.message}`)
    }
  }
}
