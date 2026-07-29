import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RouterOSAPI } from 'node-routeros'

@Injectable()
export class MikrotikService {
  private readonly logger = new Logger(MikrotikService.name)

  constructor(private config: ConfigService) {}

  private connect() {
    return new RouterOSAPI({
      host: this.config.get('MIKROTIK_HOST'),
      user: this.config.get('MIKROTIK_USER'),
      password: this.config.get('MIKROTIK_PASS'),
      port: 8728,
    })
  }

  async addSshForward(vmIp: string, externalPort: number, vmDisplayId: string) {
    const api = this.connect()
    await api.connect()
    try {
      await api.write('/ip/firewall/nat/add', [
        '=chain=dstnat',
        '=protocol=tcp',
        `=dst-port=${externalPort}`,
        '=action=dst-nat',
        `=to-addresses=${vmIp}`,
        '=to-ports=22',
        `=comment=${vmDisplayId}-ssh`,
      ])
      this.logger.log(`Added SSH forward port ${externalPort} → ${vmIp}:22`)
    } finally {
      await api.close()
    }
  }

  async removeSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/remove', [`=.id=${rule['.id']}`])
      }
      this.logger.log(`Removed SSH forward port ${externalPort}`)
    } finally {
      await api.close()
    }
  }

  async disableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=yes',
        ])
      }
    } finally {
      await api.close()
    }
  }

  async enableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=no',
        ])
      }
    } finally {
      await api.close()
    }
  }
}
