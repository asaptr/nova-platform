import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ValidationPipe } from '@nestjs/common'
import { join } from 'path'
import { AppModule } from './app.module'
import { VncProxyService } from './vnc/vnc-proxy.service'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api/v1')
  app.enableCors({
    origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean),
    credentials: true,
  })
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })

  await app.listen(process.env.PORT ?? 3000)

  // WebSocket upgrade for VNC proxy — must be after listen()
  const vncProxy = app.get(VncProxyService)
  const httpServer = app.getHttpServer()
  httpServer.on('upgrade', (req, socket, head) => {
    vncProxy.handleUpgrade(req, socket, head).catch((e) => {
      console.error('[VNC] Unhandled upgrade error:', e.message)
      try { socket.destroy() } catch {}
    })
  })

  console.log(`NOVA API running on port ${process.env.PORT ?? 3000}`)
}
bootstrap()
