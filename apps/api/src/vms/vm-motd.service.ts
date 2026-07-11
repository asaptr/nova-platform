import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'

// Script that runs at SSH login — reads /etc/nova/config and renders the banner.
// ASCII-only: VGA bitmap font in noVNC does not support Unicode box-drawing chars.
const WELCOME_SCRIPT = `#!/bin/bash
[ -f /etc/nova/config ] && source /etc/nova/config
BRAND="\${BRAND:-NOVA}"
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

// Sourced by /etc/profile.d — overrides power commands with shell functions for interactive bash.
// Covers login shells and most interactive sessions.
const RESTRICT_PROFILE = `#!/bin/bash
# Nova VPS - power management must be done through the web panel
[ -f /etc/nova/config ] && source /etc/nova/config
PANEL="\${PANEL:-}"

_nova_blocked() {
  printf "\\n  [NOVA] Perintah '%s' dinonaktifkan dari konsol.\\n" "$1"
  printf "  Gunakan tombol di web panel untuk mengelola VM.\\n"
  [ -n "\$PANEL" ] && printf "  Panel  : %s\\n" "\$PANEL"
  printf "\\n"
  return 1
}

shutdown()  { _nova_blocked "shutdown"; }
reboot()    { _nova_blocked "reboot"; }
poweroff()  { _nova_blocked "poweroff"; }
halt()      { _nova_blocked "halt"; }

systemctl() {
  case "\$1" in
    poweroff|reboot|halt|suspend|hibernate|hybrid-sleep|kexec)
      _nova_blocked "systemctl \$1"
      ;;
    disable|stop|mask)
      case "\$2" in
        qemu-guest-agent)
          printf "\\n  [NOVA] qemu-guest-agent tidak boleh dinonaktifkan.\\n\\n"
          return 1
          ;;
        *)
          command systemctl "\$@"
          ;;
      esac
      ;;
    *)
      command systemctl "\$@"
      ;;
  esac
}

export -f shutdown reboot poweroff halt systemctl 2>/dev/null || true

# Auto-logout idle root sessions — ensures console shows fresh login + banner after inactivity
TMOUT=900
readonly TMOUT
export TMOUT
`

// Placed in /usr/local/sbin/ (first in root PATH) — catches direct binary calls,
// non-bash shells, and scripts that bypass shell functions.
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

// Wraps /usr/bin/systemctl — passes through all safe subcommands,
// blocks power/suspend and protects qemu-guest-agent.
const SYSTEMCTL_WRAPPER = `#!/bin/bash
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
    exec /usr/bin/systemctl "\$@"
    ;;
  *)
    exec /usr/bin/systemctl "\$@"
    ;;
esac
`

@Injectable()
export class VmMotdService {
  private readonly logger = new Logger(VmMotdService.name)

  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
  ) {}

  buildConfig(brandName: string, panelUrl: string): string {
    return `BRAND=${JSON.stringify(brandName || 'NOVA')}\nPANEL=${JSON.stringify(panelUrl || '')}\n`
  }

  async syncTimezoneToVm(node: string, vmid: number, timezone: string): Promise<void> {
    const tz = timezone || 'Asia/Jakarta'
    await this.proxmox.agentExec(node, vmid, ['timedatectl', 'set-timezone', tz])
    await this.proxmox.agentExec(node, vmid, ['timedatectl', 'set-ntp', 'true'])
  }

  async writeToVm(node: string, vmid: number, brandName: string, panelUrl: string): Promise<void> {
    const brand = brandName || 'NOVA'
    const config = this.buildConfig(brand, panelUrl)
    const configB64 = Buffer.from(config).toString('base64')
    const scriptB64 = Buffer.from(WELCOME_SCRIPT).toString('base64')

    // /etc/issue is shown by agetty BEFORE login — visible every time console shows a login prompt.
    // \e[2J\e[H = clear screen + cursor home (agetty interprets \e as ESC) — hides the
    // "starting serial terminal on interface serial0" systemd message before banner appears.
    // \n = hostname, \l = tty name (other agetty escape sequences).
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

  async writeRestrictionsToVm(node: string, vmid: number): Promise<void> {
    const profileB64 = Buffer.from(RESTRICT_PROFILE).toString('base64')
    const blockedB64 = Buffer.from(NOVA_BLOCKED).toString('base64')
    const systemctlB64 = Buffer.from(SYSTEMCTL_WRAPPER).toString('base64')

    // Shell function overrides for interactive bash sessions
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${profileB64} | base64 -d > /etc/profile.d/nova-restrict.sh && chmod 644 /etc/profile.d/nova-restrict.sh`])

    // Binary wrapper — /usr/local/sbin/ is first in root PATH on Ubuntu
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${blockedB64} | base64 -d > /usr/local/sbin/nova-blocked && chmod 755 /usr/local/sbin/nova-blocked`])

    // Symlink all power commands to the blocked wrapper
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      'for cmd in shutdown reboot poweroff halt init telinit; do ln -sf /usr/local/sbin/nova-blocked /usr/local/sbin/$cmd; done'])

    // systemctl wrapper — passes through safe subcommands, blocks power ops
    await this.proxmox.agentExec(node, vmid, ['bash', '-c',
      `echo ${systemctlB64} | base64 -d > /usr/local/sbin/systemctl && chmod 755 /usr/local/sbin/systemctl`])
  }

  // Fire-and-forget sync to all running VMs — called after brand settings saved
  async syncAllRunning(brandName: string, panelUrl: string): Promise<void> {
    const vms = await this.prisma.vm.findMany({
      where: {
        status: 'running',
        proxmoxVmid: { not: null },
        proxmoxNode: { not: null },
      },
      select: { id: true, displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })

    this.logger.log(`Syncing MOTD to ${vms.length} running VMs (brand="${brandName}")`)

    for (const vm of vms) {
      this.writeToVm(vm.proxmoxNode, vm.proxmoxVmid, brandName, panelUrl)
        .then(() => this.logger.log(`MOTD synced: ${vm.displayId}`))
        .catch(e => this.logger.warn(`MOTD sync failed for ${vm.displayId}: ${e.message}`))
    }
  }

  // Push restrictions to all running VMs — call once to deploy to existing VMs
  async pushRestrictionsToAllRunning(): Promise<void> {
    const vms = await this.prisma.vm.findMany({
      where: {
        status: 'running',
        proxmoxVmid: { not: null },
        proxmoxNode: { not: null },
      },
      select: { id: true, displayId: true, proxmoxNode: true, proxmoxVmid: true },
    })

    this.logger.log(`Pushing console restrictions to ${vms.length} running VMs`)

    for (const vm of vms) {
      this.writeRestrictionsToVm(vm.proxmoxNode, vm.proxmoxVmid)
        .then(() => this.logger.log(`Restrictions pushed: ${vm.displayId}`))
        .catch(e => this.logger.warn(`Restrictions push failed for ${vm.displayId}: ${e.message}`))
    }
  }

  // Fix vga:std on all VMs — config update takes effect after VM stop+start
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
      // Change vga to std; keep serial0 (needed for xterm terminal)
      this.proxmox.updateVmConfig(vm.proxmoxNode, vm.proxmoxVmid, { vga: 'std' })
        .then(() => this.logger.log(`VGA fixed: ${vm.displayId}`))
        .catch(e => this.logger.warn(`VGA fix failed for ${vm.displayId}: ${e.message}`))
    }
  }
}
