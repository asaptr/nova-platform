import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api/v1')
  app.enableCors({
    origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean),
    credentials: true,
  })

  await app.listen(process.env.PORT ?? 3000)
  console.log(`Langit Node API running on port ${process.env.PORT ?? 3000}`)
}
bootstrap()
