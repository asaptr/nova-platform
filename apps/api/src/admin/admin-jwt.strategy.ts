import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('ADMIN_JWT_SECRET'),
    })
  }

  validate(payload: { sub: string; email: string; role: string }) {
    if (payload.role !== 'admin' && payload.role !== 'superadmin') {
      throw new UnauthorizedException()
    }
    return { sub: payload.sub, email: payload.email, role: payload.role }
  }
}
