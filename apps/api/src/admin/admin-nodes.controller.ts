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
      }),
    ])

    return nodes.map((node: any) => ({
      ...node,
      vmCounts: vmStats.filter(s => s.proxmoxNode === node.node),
    }))
  }

  @Get(':node/status')
  getNodeStatus(@Param('node') node: string) {
    return this.proxmox.getNodeStatus(node)
  }
}
