import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { ProxmoxSshService } from '../proxmox/proxmox-ssh.service'
import * as WebSocket from 'ws'
import * as http from 'http'
import * as https from 'https'

const VNC_PATH  = /^\/api\/v1\/vms\/([^/]+)\/console\/ws/
const TERM_PATH = /^\/api\/v1\/vms\/([^/]+)\/terminal\/ws/

@Injectable()
export class VncProxyService {
  private readonly logger = new Logger(VncProxyService.name)
  private readonly wss = new WebSocket.Server({ noServer: true })

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
    private proxmox: ProxmoxService,
    private proxmoxSsh: ProxmoxSshService,
  ) {}

  private verifyToken(token: string): { sub: string; isAdmin: boolean } | null {
    try {
      const payload = this.jwtService.verify<any>(token, { secret: this.config.get('JWT_SECRET') })
      return { sub: payload.sub, isAdmin: false }
    } catch {}
    try {
      const payload = this.jwtService.verify<any>(token, { secret: this.config.get('ADMIN_JWT_SECRET') })
      if (payload.role === 'admin' || payload.role === 'superadmin') {
        return { sub: payload.sub, isAdmin: true }
      }
    } catch {}
    return null
  }

  async handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer) {
    const url = new URL(req.url!, `http://localhost`)

    if (TERM_PATH.test(url.pathname)) {
      return this.handleTermUpgrade(req, socket, head, url)
    }

    const match = url.pathname.match(VNC_PATH)
    if (!match) { socket.destroy(); return }

    const vmId = match[1]
    const token = url.searchParams.get('token')
    const vncTicket = url.searchParams.get('vncTicket')
    const vncPort = url.searchParams.get('vncPort')
    const node = url.searchParams.get('node')
    const vmidParam = url.searchParams.get('vmid')

    this.logger.log(`VNC upgrade: vmId=${vmId} port=${vncPort}`)

    const auth = this.verifyToken(token)
    if (!auth) {
      this.logger.warn(`VNC auth failed for vmId=${vmId}`)
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy(); return
    }

    // Admin can access any VM; user can only access their own
    const vmWhere = auth.isAdmin ? { id: vmId } : { id: vmId, userId: auth.sub }
    const vm = await this.prisma.vm.findFirst({ where: vmWhere })
    if (!vm) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy(); return
    }

    const proxmoxNode = node ?? vm.proxmoxNode
    const proxmoxVmid = vmidParam ?? String(vm.proxmoxVmid)

    if (!vncTicket || !vncPort || !proxmoxNode || !proxmoxVmid) {
      this.logger.warn(`VNC missing params: ticket=${!!vncTicket} port=${vncPort}`)
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy(); return
    }

    const host = this.config.get('PROXMOX_HOST')
    const port = this.config.get('PROXMOX_PORT') ?? '8006'
    const targetUrl = `wss://${host}:${port}/api2/json/nodes/${proxmoxNode}/qemu/${proxmoxVmid}/vncwebsocket?port=${vncPort}&vncticket=${encodeURIComponent(vncTicket)}`
    this.logger.log(`Connecting upstream: ${proxmoxNode}/${proxmoxVmid} port=${vncPort}`)

    const upstream = new WebSocket(targetUrl, {
      agent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        Authorization: `PVEAPIToken=${this.config.get('PROXMOX_TOKEN_ID')}=${this.config.get('PROXMOX_TOKEN_SECRET')}`,
      },
    })

    upstream.on('open', () => {
      this.logger.log(`Upstream open, buffering for VM ${vmId}`)
      const earlyMessages: Array<{ data: any; isBinary: boolean }> = []
      const bufferHandler = (data: any, isBinary: boolean) => earlyMessages.push({ data, isBinary })
      upstream.on('message', bufferHandler)

      this.wss.handleUpgrade(req, socket, head, (clientWs) => {
        upstream.off('message', bufferHandler)
        this.logger.log(`Flushing ${earlyMessages.length} buffered msgs to client`)
        for (const msg of earlyMessages) {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(msg.data, { binary: msg.isBinary })
        }

        upstream.on('message', (data, isBinary) => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary })
        })
        clientWs.on('message', (data, isBinary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary })
        })

        const ping = setInterval(() => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.ping()
          else { clearInterval(ping); try { upstream.terminate() } catch {} }
        }, 30_000)

        const cleanup = () => { clearInterval(ping); try { upstream.terminate() } catch {} }
        upstream.on('close', () => { clearInterval(ping); if (clientWs.readyState === WebSocket.OPEN) clientWs.close() })
        clientWs.on('close', cleanup)
        clientWs.on('error', cleanup)
      })
    })

    upstream.on('error', (e) => {
      this.logger.error(`Upstream error VM ${vmId}: ${e.message}`)
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      socket.destroy()
    })
  }

  private async handleTermUpgrade(req: http.IncomingMessage, socket: any, head: Buffer, url: URL) {
    const match = url.pathname.match(TERM_PATH)
    if (!match) { socket.destroy(); return }

    const vmId  = match[1]
    const token = url.searchParams.get('token')

    const auth = this.verifyToken(token)
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy(); return
    }

    const vmWhere = auth.isAdmin ? { id: vmId } : { id: vmId, userId: auth.sub }
    const vm = await this.prisma.vm.findFirst({ where: vmWhere })
    if (!vm) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy(); return
    }

    const vmid = String(vm.proxmoxVmid)
    this.logger.log(`Term SSH: connecting for VM ${vmid}`)

    let ssh: any
    try {
      ssh = await this.proxmoxSsh.connectRaw()
    } catch (e: any) {
      this.logger.error(`Term SSH connect failed: ${e.message}`)
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      socket.destroy(); return
    }

    const conn = (ssh as any).connection
    conn.exec(
      `/usr/sbin/qm terminal ${vmid} -escape 0`,
      { pty: { term: 'xterm-256color', cols: 80, rows: 24, width: 0, height: 0, modes: {} } },
      (err: Error | undefined, stream: any) => {
        if (err) {
          this.logger.error(`Term SSH exec error: ${err.message}`)
          socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
          socket.destroy()
          try { ssh.dispose() } catch {}
          return
        }

        this.wss.handleUpgrade(req, socket, head, (clientWs) => {
          stream.on('data', (data: Buffer) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: true })
          })
          stream.stderr.on('data', (data: Buffer) => {
            this.logger.warn(`Term SSH stderr VM ${vmid}: ${data.toString().slice(0, 200)}`)
          })

          clientWs.on('message', (data: any, isBinary: boolean) => {
            const buf: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
            if (isBinary && buf.length > 0 && buf[0] === 0x01) {
              // Resize: \x01cols:rows:
              const parts = buf.slice(1).toString().replace(/:$/, '').split(':').map(Number)
              if (parts.length === 2 && parts[0] && parts[1]) stream.setWindow(parts[1], parts[0], 0, 0)
            } else {
              stream.write(buf)
            }
          })

          const ping = setInterval(() => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.ping()
            else { clearInterval(ping); try { stream.close(); ssh.dispose() } catch {} }
          }, 30_000)

          stream.on('close', () => {
            this.logger.log(`Term SSH stream closed for VM ${vmid}`)
            clearInterval(ping)
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
            try { ssh.dispose() } catch {}
          })

          clientWs.on('close', (code: number) => {
            this.logger.log(`Term client closed: code=${code}`)
            clearInterval(ping)
            try { stream.close() } catch {}
            try { ssh.dispose() } catch {}
          })

          clientWs.on('error', () => {
            clearInterval(ping)
            try { stream.close() } catch {}
            try { ssh.dispose() } catch {}
          })
        })
      }
    )
  }
}
