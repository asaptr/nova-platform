import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { SystemConfigService } from '../system-config/system-config.service'

const WELCOME_SCRIPT = `#!/bin/bash
[ -f /etc/nova/config ] && source /etc/nova/config
BRAND="\${BRAND:-NOVA}"
HEADLINE="\${HEADLINE:-}"
PANEL="\${PANEL:-}"
HOST=$(hostname 2>/dev/null)
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
CPU=$(nproc 2>/dev/null)
MEM=$(free -h 2>/dev/null | awk '/^Mem:/ {printf "%s / %s", $3, $2}')
DISK=$(df -h / 2>/dev/null | awk 'NR==2 {printf "%s / %s", $3, $2}')
UPTIME=$(uptime -p 2>/dev/null | sed "s/^up //")
echo ""
echo "  =================================================="
printf "   %s\\n" "$BRAND"
[ -n "\$HEADLINE" ] && printf "   %s\\n" "\$HEADLINE"
echo "  --------------------------------------------------"
printf "   Host   : %s\\n" "$HOST"
printf "   IP     : %s\\n" "$IP"
printf "   CPU    : %s vCPU\\n" "$CPU"
printf "   Memory : %s\\n" "$MEM"
printf "   Disk   : %s\\n" "$DISK"
printf "   Uptime : %s\\n" "$UPTIME"
[ -n "$PANEL" ] && echo "  --------------------------------------------------" && printf "   Panel  : %s\\n" "$PANEL"
echo "  =================================================="
echo ""
`

// Generic blocked wrapper — symlinked from each restricted command name.
// Uses $0 so the error message shows the actual command attempted.
const NOVA_BLOCKED = `#!/bin/bash
[ -f /etc/nova/config ] && source /etc/nova/config
PANEL="\${PANEL:-}"
CMD="\$(basename "\$0")"
printf "\\n  [NOVA] Perintah '%s' dinonaktifkan dari konsol.\\n" "\$CMD"
printf "  Gunakan tombol di web panel untuk mengelola VM.\\n"
[ -n "\$PANEL" ] && printf "  Panel  : %s\\n" "\$PANEL"
printf "\\n"
exit 1
`

// Wraps systemctl — blocks power subcommands, protects qemu-guest-agent,
// passes everything else to the real binary at /usr/bin/.systemctl.nova.
const SYSTEMCTL_WRAPPER = `#!/bin/bash
REAL=/usr/bin/.systemctl.nova
[ -x "\$REAL" ] || REAL=$(command -v systemctl.real 2>/dev/null || echo /lib/systemd/systemd)
case "\$1" in
  poweroff|reboot|halt|suspend|hibernate|hybrid-sleep|kexec)
    [ -f /etc/nova/config ] && source /etc/nova/config
    PANEL="\${PANEL:-}"
    printf "\\n  [NOVA] 'systemctl %s' dinonaktifkan dari konsol.\\n" "\$1"
    printf "  Gunakan tombol di web panel untuk mengelola VM.\\n"
    [ -n "\$PANEL" ] && printf "  Panel  : %s\\n" "\$PANEL"
    printf "\\n"
    exit 1
    ;;
  disable|stop|mask)
    if [ "\$2" = "qemu-guest-agent" ]; then
      printf "\\n  [NOVA] qemu-guest-agent tidak boleh dinonaktifkan.\\n\\n"
      exit 1
    fi
    exec "\$REAL" "\$@"
    ;;
  *)
    exec "\$REAL" "\$@"
    ;;
esac
`

function buildRestrictProfile(commands: string[]): string {
  const fns = commands.map(cmd => `${cmd}() { _nova_blocked "${cmd}"; }`).join('\n')
  const exports = [...commands, 'systemctl'].join(' ')
  return `#!/bin/bash
[ -f /etc/nova/config ] && source /etc/nova/config
PANEL="\${PANEL:-}"

_nova_blocked() {
  printf "\\n  [NOVA] Perintah '%s' dinonaktifkan dari konsol.\\n" "$1"
  printf "  Gunakan tombol di web panel untuk mengelola VM.\\n"
  [ -n "\$PANEL" ] && printf "  Panel  : %s\\n" "\$PANEL"
  printf "\\n"
  return 1
}

${fns}

systemctl() {
  case "$1" in
    poweroff|reboot|halt|suspend|hibernate|hybrid-sleep|kexec)
      _nova_blocked "systemctl $1"
      ;;
    disable|stop|mask)
      case "$2" in
        qemu-guest-agent)
          printf "\\n  [NOVA] qemu-guest-agent tidak boleh dinonaktifkan.\\n\\n"
          return 1
          ;;
        *)
          command systemctl "$@"
          ;;
      esac
      ;;
    *)
      command systemctl "$@"
      ;;
  esac
}

export -f ${exports} 2>/dev/null || true

TMOUT=900
readonly TMOUT
export TMOUT
`
}

const DEFAULT_RESTRICTED_COMMANDS = ['shutdown', 'reboot', 'poweroff', 'halt', 'init', 'telinit']

@Injectable()
export class VmMotdService {
  private readonly logger = new Logger(VmMotdService.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private systemConfig: SystemConfigService,
  ) {}

  buildConfig(brandName: string, panelUrl: string, headline?: string): string {
    return `BRAND=${JSON.stringify(brandName || 'NOVA')}\nPANEL=${JSON.stringify(panelUrl || '')}\nHEADLINE=${JSON.stringify(headline || '')}\n`
  }

  async syncTimezoneToVm(node: string, vmid: number, timezone: string): Promise<void> {
    const tz = timezone || 'Asia/Jakarta'
    await this.proxmox.agentExec(node, vmid, ['timedatectl', 'set-timezone', tz])
    await this.proxmox.agentExec(node, vmid, ['timedatectl', 'set-ntp', 'true'])
  }

  async writeToVm(node: string, vmid: number, brandName: string, panelUrl: string): Promise<void> {
    const brand = brandName || 'NOVA'
    const headline = await this.systemConfig.get('motd.headline').catch(() => '') ?? ''
    const config = this.buildConfig(brand, panelUrl, headline)
    const configB64 = Buffer.from(config).toString('base64')
    const scriptB64 = Buffer.from(WELCOME_SCRIPT).toString('base64')

    const issue = [
      '\\e[2J\\e[H',
      '',
      '  ==================================================',
      `   ${brand} VPS`,
      '  --------------------------------------------------',
      '   Host   : \\n',
      '   Console: \\l',
      ...(panelUrl ? [`   Panel  : ${panelUrl}`] : []),
      '  ==================================================',
      '',
    ].join('\n')
    const issueB64 = Buffer.from(issue).toString('base64')

    await this.proxmox.agentExec(node, vmid, ['bash', '-c', 'mkdir -p /etc/nova'])
    await this.proxmox.agentExec(node, vmid, ['bash', '-c', `echo ${configB64} | base64 -d > /etc/nova/config`])
    await this.proxmox.agentExec(node, vmid, ['bash', '-c', `echo ${scriptB64} | base64 -d > /etc/update-motd.d/99-nova && chmod +x /etc/update-motd.d/99-nova`])
    await this.proxmox.agentExec(node, vmid, ['bash', '-c', '> /etc/motd'])
    await this.proxmox.agentExec(node, vmid, ['bash', '-c', `echo ${issueB64} | base64 -d > /etc/issue`])
  }

  async getActiveCommands(): Promise<string[]> {
    try {
      const rows = await this.prisma.restrictedCommand.findMany({
        where: { isActive: true },
        select: { command: true },
      })
      return rows.length > 0 ? rows.map(r => r.command) : DEFAULT_RESTRICTED_COMMANDS
    } catch {
      return DEFAULT_RESTRICTED_COMMANDS
    }
  }

  async writeRestrictionsToVm(node: string, vmid: number, commands?: string[]): Promise<void> {
    const cmds = commands ?? await this.getActiveCommands()
    const profile = buildRestrictProfile(cmds)
    const profileB64 = Buffer.from(profile).toString('base64')
    const blockedB64 = Buffer.from(NOVA_BLOCKED).toString('base64')
    const systemctlB64 = Buffer.from(SYSTEMCTL_WRAPPER).toString('base64')
    const cmdList = cmds.join(' ')

    // 1. Write nova-blocked wrapper
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${blockedB64} | base64 -d > /usr/local/sbin/nova-blocked && chmod 755 /usr/local/sbin/nova-blocked`])

    // 2. Preserve real systemctl binary before overriding (idempotent — skip if already a symlink)
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      '[ -f /usr/bin/systemctl ] && [ ! -L /usr/bin/systemctl ] && cp /usr/bin/systemctl /usr/bin/.systemctl.nova || true'])

    // 3. Write systemctl wrapper (calls .systemctl.nova as real binary)
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${systemctlB64} | base64 -d > /usr/local/sbin/systemctl && chmod 755 /usr/local/sbin/systemctl`])

    // 4. Symlink systemctl at all standard paths to prevent /usr/bin/systemctl bypass
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      'for f in /usr/bin/systemctl /bin/systemctl /sbin/systemctl /usr/sbin/systemctl; do d=$(dirname "$f"); [ -d "$d" ] && ln -sf /usr/local/sbin/systemctl "$f" 2>/dev/null || true; done'])

    // 5. Symlink restricted commands in /usr/local/sbin/ (PATH-first override)
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `for cmd in ${cmdList}; do ln -sf /usr/local/sbin/nova-blocked /usr/local/sbin/\$cmd; done`])

    // 6. Symlink restricted commands at all standard binary locations (prevent full-path bypass)
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `for dir in /sbin /usr/sbin /bin /usr/bin; do for cmd in ${cmdList}; do [ -d "\$dir" ] && ln -sf /usr/local/sbin/nova-blocked "\$dir/\$cmd" 2>/dev/null || true; done; done`])

    // 7. Shell function overrides for interactive bash sessions
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${profileB64} | base64 -d > /etc/profile.d/nova-restrict.sh && chmod 644 /etc/profile.d/nova-restrict.sh`])
  }

  async syncAllRunning(brandName: string, panelUrl: string): Promise<{ pushed: number; failed: number }> {
    const vms = await this.prisma.vm.findMany({
      where: { status: 'running', proxmoxVmid: { not: null }, proxmoxNode: { not: null } },
      select: { id: true, displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })
    this.logger.log(`Syncing MOTD to ${vms.length} running VMs (brand="${brandName}")`)
    let pushed = 0, failed = 0
    for (const vm of vms) {
      try {
        await this.writeToVm(vm.proxmoxNode, vm.proxmoxVmid, brandName, panelUrl)
        this.logger.log(`MOTD synced: ${vm.displayId}`)
        pushed++
      } catch (e: any) {
        this.logger.warn(`MOTD sync failed for ${vm.displayId}: ${e.message}`)
        failed++
      }
    }
    return { pushed, failed }
  }

  async enableAgentAllVms(): Promise<{ fixed: number; failed: number }> {
    const vms = await this.prisma.vm.findMany({
      where: { proxmoxVmid: { not: null }, proxmoxNode: { not: null }, status: { notIn: ['deleted', 'pending', 'failed'] } },
      select: { displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })
    this.logger.log(`Enabling agent config on ${vms.length} VMs`)
    let fixed = 0, failed = 0
    for (const vm of vms) {
      try {
        await this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { agent: 'enabled=1,fstrim_cloned_disks=0' })
        this.logger.log(`Agent enabled: ${vm.displayId}`)
        fixed++
      } catch (e: any) {
        this.logger.warn(`Agent enable failed for ${vm.displayId}: ${e.message}`)
        failed++
      }
    }
    return { fixed, failed }
  }

  async pushRestrictionsToAllRunning(commands?: string[]): Promise<{ pushed: number; failed: number }> {
    const cmds = commands ?? await this.getActiveCommands()
    const vms = await this.prisma.vm.findMany({
      where: { status: 'running', proxmoxVmid: { not: null }, proxmoxNode: { not: null } },
      select: { id: true, displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })
    this.logger.log(`Pushing restrictions [${cmds.join(',')}] to ${vms.length} running VMs`)

    let pushed = 0
    let failed = 0
    for (const vm of vms) {
      try {
        await this.writeRestrictionsToVm(vm.proxmoxNode, vm.proxmoxVmid, cmds)
        this.logger.log(`Restrictions pushed: ${vm.displayId}`)
        pushed++
      } catch (e: any) {
        this.logger.warn(`Restrictions push failed for ${vm.displayId}: ${e.message}`)
        failed++
      }
    }
    return { pushed, failed }
  }

  async pushDnsToVm(node: string, vmid: number, primary: string, secondary: string): Promise<void> {
    // Disable systemd-resolved stub so resolv.conf uses real IPs, not 127.0.0.53
    const script = [
      `PRIMARY="${primary}"`,
      `SECONDARY="${secondary}"`,
      `if systemctl is-active systemd-resolved --quiet 2>/dev/null; then`,
      `  mkdir -p /etc/systemd/resolved.conf.d`,
      `  printf "[Resolve]\\nDNS=%s %s\\nFallbackDNS=\\nDNSStubListener=no\\n" "$PRIMARY" "$SECONDARY" > /etc/systemd/resolved.conf.d/nova.conf`,
      `  systemctl restart systemd-resolved 2>/dev/null || true`,
      `fi`,
      `rm -f /etc/resolv.conf`,
      `printf "nameserver %s\\nnameserver %s\\n" "$PRIMARY" "$SECONDARY" > /etc/resolv.conf`,
    ].join('\n')
    const b64 = Buffer.from(script).toString('base64')
    await this.proxmox.agentExec(node, vmid, ['bash', '-c', `echo ${b64} | base64 -d | bash`])
  }

  async pushDnsToAllRunning(primary: string, secondary: string): Promise<{ pushed: number; failed: number }> {
    const vms = await this.prisma.vm.findMany({
      where: { status: 'running', proxmoxVmid: { not: null }, proxmoxNode: { not: null } },
      select: { id: true, displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })
    this.logger.log(`Pushing DNS ${primary}/${secondary} to ${vms.length} running VMs`)
    let pushed = 0, failed = 0
    for (const vm of vms) {
      try {
        await this.pushDnsToVm(vm.proxmoxNode, vm.proxmoxVmid, primary, secondary)
        this.logger.log(`DNS pushed: ${vm.displayId}`)
        pushed++
      } catch (e: any) {
        this.logger.warn(`DNS push failed for ${vm.displayId}: ${e.message}`)
        failed++
      }
    }
    return { pushed, failed }
  }

  async fixVgaAllVms(): Promise<void> {
    const vms = await this.prisma.vm.findMany({
      where: {
        proxmoxVmid: { not: null },
        proxmoxNode: { not: null },
        status: { notIn: ['deleted', 'pending', 'failed'] },
      },
      select: { displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })
    this.logger.log(`Fixing VGA config for ${vms.length} VMs`)
    for (const vm of vms) {
      this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std' })
        .then(() => this.logger.log(`VGA fixed: ${vm.displayId}`))
        .catch(e => this.logger.warn(`VGA fix failed for ${vm.displayId}: ${e.message}`))
    }
  }
}
