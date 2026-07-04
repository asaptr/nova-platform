import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import * as WebSocket from 'ws'
import * as http from 'http'
import * as https from 'https'

const VNC_PATH = /^\/api\/v1\/vms\/([^/]+)\/console\/ws/

@Injectable()
export class VncProxyService {
  private readonly logger = new Logger(VncProxyService.name)
  private readonly wss = new WebSocket.Server({ noServer: true })

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
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
}
