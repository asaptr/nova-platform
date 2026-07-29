import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { PrismaService } from '../prisma/prisma.service'

@Controller('admin/nodes')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminNodesController {
  constructor(
    private proxmox: ProxmoxService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async getNodes() {
    const [nodes, vmStats] = await Promise.all([
      this.proxmox.getNodes(),
      this.prisma.vm.groupBy({
        by: ['proxmoxNode', 'status'],
        _count: { id: true },
        where: { status: { not: 'deleted' } },
      }),
    ])

    return nodes.map((node: any) => {
      const counts = vmStats.filter(s => s.proxmoxNode === node.node)
      return {
        ...node,
        // Normalise Proxmox flat fields → nested shape the frontend expects
        memory: { used: node.mem ?? 0, total: node.maxmem ?? 0 },
        rootfs: { used: node.disk ?? 0, total: node.maxdisk ?? 0 },
        vmCount: counts.reduce((sum, s) => sum + s._count.id, 0),
        vmCounts: counts,
      }
    })
  }

  @Get(':node/status')
  getNodeStatus(@Param('node') node: string) {
    return this.proxmox.getNodeStatus(node)
  }
}
