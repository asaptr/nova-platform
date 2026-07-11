import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NodeSSH } from 'node-ssh'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

@Injectable()
export class ProxmoxSshService {
  private readonly logger = new Logger(ProxmoxSshService.name)

  constructor(private config: ConfigService) {}

  async connectRaw(): Promise<NodeSSH> {
    return this.connect()
  }

  private async connect(): Promise<NodeSSH> {
    const ssh = new NodeSSH()
    const host     = this.config.get<string>('PROXMOX_SSH_HOST') || this.config.get<string>('PROXMOX_HOST')
    const port     = +(this.config.get<string>('PROXMOX_SSH_PORT') ?? '22')
    const username = this.config.get<string>('PROXMOX_SSH_USER') ?? 'root'
    const keyPath  = this.config.get<string>('PROXMOX_SSH_KEY')
    const password = this.config.get<string>('PROXMOX_SSH_PASSWORD')

    if (!host) throw new Error('PROXMOX_HOST or PROXMOX_SSH_HOST is not configured')
    if (!keyPath && !password) throw new Error('PROXMOX_SSH_KEY or PROXMOX_SSH_PASSWORD is not configured')

    await ssh.connect({
      host,
      port,
      username,
      ...(keyPath ? { privateKeyPath: keyPath } : { password }),
      readyTimeout: 10_000,
    })
    return ssh
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const ssh = await this.connect()
    try {
      const result = await ssh.execCommand(command)
      if (result.code !== 0 && result.stderr) {
        this.logger.warn(`SSH exec stderr: ${result.stderr.slice(0, 500)}`)
      }
      return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 }
    } finally {
      ssh.dispose()
    }
  }

  // Write script to local temp, upload via SFTP, execute, cleanup
  async runScript(script: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const ts       = Date.now()
    const localTmp = join(tmpdir(), `nova-script-${ts}.sh`)
    const remoteTmp = `/tmp/nova-script-${ts}.sh`

    writeFileSync(localTmp, script, 'utf8')

    const ssh = await this.connect()
    try {
      await ssh.putFile(localTmp, remoteTmp)
      const result = await ssh.execCommand(`bash ${remoteTmp}; rm -f ${remoteTmp}`)
      this.logger.log(`Script output: ${result.stdout.slice(0, 500)}`)
      if (result.stderr) this.logger.warn(`Script stderr: ${result.stderr.slice(0, 500)}`)
      return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 }
    } finally {
      ssh.dispose()
      try { unlinkSync(localTmp) } catch {}
    }
  }
}
