import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() body: { email: string; password: string; fullName: string; phone?: string }) {
    return this.auth.register(body.email, body.password, body.fullName, body.phone)
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { email: string; password: string }, @Req() req: any) {
    return this.auth.login(body.email, body.password, req.ip)
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken)
  }
}
