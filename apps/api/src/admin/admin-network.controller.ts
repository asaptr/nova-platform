import { Controller, Get, Post, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common'
import { AdminJwtGuard } from './admin-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { ProxmoxSshService } from '../proxmox/proxmox-ssh.service'
import { SystemConfigService } from '../system-config/system-config.service'
import { ConfigService } from '@nestjs/config'

@Controller('admin/network')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('superadmin')
export class AdminNetworkController {
  private readonly logger = new Logger(AdminNetworkController.name)

  constructor(
    private proxmox: ProxmoxService,
    private ssh: ProxmoxSshService,
    private systemConfig: SystemConfigService,
    private config: ConfigService,
  ) {}

  private async getNode(): Promise<string> {
    return (await this.systemConfig.get('proxmox.node')) || this.config.get('PROXMOX_NODE') || 'pve'
  }

  @Get('bridges')
  async listBridges() {
    try {
      const node = await this.getNode()
      return await this.proxmox.listBridges(node)
    } catch (e: any) {
      this.logger.error(`listBridges failed: ${e.message}`)
      return []
    }
  }

  @Post('bridges')
  async createBridge(
    @Body() body: { iface: string; bridgePorts?: string; address?: string; netmask?: string },
  ) {
    const node = await this.getNode()
    await this.proxmox.createBridge(node, body.iface, body.bridgePorts ?? '', body.address, body.netmask)
    return { message: `Bridge ${body.iface} berhasil dibuat dan diaplikasikan` }
  }

  @Post('apply-gateway')
  async applyGateway() {
    const [natBridge, natNetwork, publicBridge] = await Promise.all([
      this.systemConfig.get('nat.bridge'),
      this.systemConfig.get('nat.network'),
      this.systemConfig.get('nat.out_iface').catch(() => null),
    ])

    if (!natBridge)   throw new BadRequestException('nat.bridge belum dikonfigurasi')
    if (!natNetwork)  throw new BadRequestException('nat.network belum dikonfigurasi')

    const [ipPart, prefixStr] = natNetwork.split('/')
    const prefix = parseInt(prefixStr ?? '24')
    if (!ipPart || isNaN(prefix)) throw new BadRequestException('Format CIDR tidak valid')

    const totalHosts = Math.pow(2, 32 - prefix)
    const ipNums    = ipPart.split('.').map(Number)
    const ipNum     = ((ipNums[0] << 24) | (ipNums[1] << 16) | (ipNums[2] << 8) | ipNums[3]) >>> 0
    const mask      = (~(totalHosts - 1)) >>> 0
    const networkNum = (ipNum & mask) >>> 0
    const gatewayNum = networkNum + 1
    const gateway    = [(gatewayNum >>> 24) & 0xff, (gatewayNum >>> 16) & 0xff, (gatewayNum >>> 8) & 0xff, gatewayNum & 0xff].join('.')
    const netmask    = [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff].join('.')
    // Proper network address (e.g. "10.50.0.0/20"), not the raw CIDR input
    const networkAddr = [(networkNum >>> 24) & 0xff, (networkNum >>> 16) & 0xff, (networkNum >>> 8) & 0xff, networkNum & 0xff].join('.')
    const networkCidr = `${networkAddr}/${prefix}`

    // Derive the "out" interface: prefer config, fall back to vmbr0
    const outIface  = publicBridge || this.config.get('PUBLIC_BRIDGE') || 'vmbr0'

    const node = await this.getNode()
    this.logger.log(`Applying gateway ${gateway}/${prefix} to bridge ${natBridge}, masq ${networkCidr} → ${outIface}`)

    // Do everything via SSH (root access) — bypasses Proxmox API permission issues for Sys.Modify.
    // SSH updates: /etc/network/interfaces (persistent) + bridge IP live + iptables live.
    try {
      const script = this.buildNatScript(networkCidr, gateway, natBridge, outIface, prefix)
      const result = await this.ssh.runScript(script)
      if (result.code !== 0) {
        this.logger.warn(`SSH script non-zero exit (${result.code}): ${result.stderr}`)
        throw new Error(result.stderr || `Exit code ${result.code}`)
      }
      this.logger.log(`SSH script output: ${result.stdout.slice(0, 300)}`)
    } catch (sshErr: any) {
      this.logger.warn(`SSH update failed: ${sshErr.message}`)
      // Fallback: try Proxmox API (requires Sys.Modify)
      try {
        await this.proxmox.updateBridgeAddress(node, natBridge, gateway, netmask)
        return {
          message: `Bridge ${natBridge} → ${gateway}/${prefix} diperbarui via Proxmox API. iptables TIDAK diperbarui otomatis (SSH gagal: ${sshErr.message}). Perbarui manual atau set PROXMOX_SSH_KEY / PROXMOX_SSH_PASSWORD di .env.`,
          gateway, netmask, sshSkipped: true,
        }
      } catch (apiErr: any) {
        const detail = apiErr?.response?.data?.message ?? apiErr?.message ?? 'Unknown'
        throw new BadRequestException(`SSH gagal: ${sshErr.message} | Proxmox API juga gagal: ${detail}`)
      }
    }

    return {
      message: `Bridge ${natBridge} → ${gateway}/${prefix}, masquerade ${natNetwork} → ${outIface} berhasil diterapkan.`,
      gateway, netmask,
    }
  }

  private buildNatScript(network: string, gateway: string, bridge: string, outIface: string, prefix: number): string {
    return `#!/bin/bash
set -e

NETWORK="${network}"
GATEWAY="${gateway}"
BRIDGE="${bridge}"
OUT="${outIface}"
PREFIX="${prefix}"

echo "[nova-nat] bridge=\$BRIDGE gw=\$GATEWAY/\$PREFIX net=\$NETWORK out=\$OUT"

# Backup interfaces file
cp /etc/network/interfaces "/etc/network/interfaces.nova.$(date +%s).bak" 2>/dev/null || true

# ── 1. Update /etc/network/interfaces (persistence across reboots) ──────────
python3 - "\$BRIDGE" "\$GATEWAY" "\$PREFIX" "\$NETWORK" "\$OUT" << 'PYEOF'
import sys, re

bridge, gw, prefix, network, out = sys.argv[1:]
cidr = gw + '/' + prefix

with open('/etc/network/interfaces') as f:
    txt = f.read()

# Update "address X.X.X.X/Y" or "address X.X.X.X" under the bridge stanza
def patch_stanza(m):
    s = m.group(0)
    # Replace address line (with or without prefix)
    s = re.sub(r'(\n[ \t]+address )[\d./]+', r'\\g<1>' + cidr, s)
    # Update iptables masquerade source in post-up/post-down
    s = re.sub(
        r"(-s ')([^']+)(' -o " + re.escape(out) + r" -j MASQUERADE)",
        r"\\g<1>" + network + r"\\g<3>",
        s
    )
    return s

txt = re.sub(
    r'(?ms)iface ' + re.escape(bridge) + r' inet static(?:\\n[ \\t]+[^\\n]+)*',
    patch_stanza,
    txt
)

with open('/etc/network/interfaces', 'w') as f:
    f.write(txt)
print('[nova-nat] /etc/network/interfaces updated')
PYEOF

# ── 2. Update bridge IP live (no ifreload — avoids disrupting running VMs) ──
echo "[nova-nat] Updating bridge IP live..."
# Add new IP first (non-disruptive)
ip addr add "\$GATEWAY/\$PREFIX" dev "\$BRIDGE" 2>/dev/null || true
# Remove old addresses (keep only the new one)
ip addr show dev "\$BRIDGE" | awk '/inet /{print \$2}' | grep -v "^\$GATEWAY/\$PREFIX$" | while IFS= read -r old; do
    ip addr del "\$old" dev "\$BRIDGE" 2>/dev/null || true
done
ip link set "\$BRIDGE" up 2>/dev/null || true
echo "[nova-nat] bridge \$BRIDGE IP → \$GATEWAY/\$PREFIX"

# ── 3. Update iptables POSTROUTING (live, no reboot needed) ─────────────────
echo "[nova-nat] Updating iptables..."
iptables -t nat -S POSTROUTING 2>/dev/null \\
  | grep -- "-o \$OUT -j MASQUERADE" \\
  | sed 's/-A /-D /' \\
  | while IFS= read -r rule; do iptables -t nat \$rule 2>/dev/null || true; done
iptables -t nat -A POSTROUTING -s "\$NETWORK" -o "\$OUT" -j MASQUERADE
echo "[nova-nat] iptables POSTROUTING: -s \$NETWORK -o \$OUT -j MASQUERADE"

echo "[nova-nat] Done!"
`
  }
}
