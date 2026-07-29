import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async register(email: string, password: string, fullName: string, phone?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } })
    if (exists) throw new ConflictException('Email sudah terdaftar')

    if (password.length < 8) throw new BadRequestException('Password minimal 8 karakter')

    const hash = await bcrypt.hash(password, 12)
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hash, fullName, phone },
    })

    await this.audit.log({
      actorType: 'user',
      actorId: user.id,
      action: 'user.register',
      resourceType: 'user',
      resourceId: user.id,
    })

    return { message: 'Registrasi berhasil. Silahkan login.' }
  }

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new UnauthorizedException('Email atau password salah')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Email atau password salah')

    if (user.status !== 'active') throw new UnauthorizedException('Akun tidak aktif atau di-suspend')

    const payload = { sub: user.id, email: user.email, role: 'user' }

    await this.audit.log({
      actorType: 'user',
      actorId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: ip,
    })

    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwt.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        balance: user.balance,
        status: user.status,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken)
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user || user.status !== 'active') throw new UnauthorizedException()

      const newPayload = { sub: user.id, email: user.email, role: 'user' }
      return {
        accessToken: this.jwt.sign(newPayload, { expiresIn: '15m' }),
      }
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid')
    }
  }
}
