import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } })
    if (!admin) throw new UnauthorizedException('Email atau password salah')

    const valid = await bcrypt.compare(password, admin.passwordHash)
    if (!valid) throw new UnauthorizedException('Email atau password salah')

    if (admin.status !== 'active') throw new UnauthorizedException('Akun admin tidak aktif')

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    await this.audit.log({
      actorType: 'admin',
      actorId: admin.id,
      action: 'admin.login',
      ipAddress: ip,
    })

    const payload = { sub: admin.id, email: admin.email, role: admin.role }
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '8h' }),
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    }
  }

  async createAdmin(creatorId: string, data: { email: string; password: string; fullName: string; role: 'admin' | 'superadmin' }) {
    const exists = await this.prisma.adminUser.findUnique({ where: { email: data.email } })
    if (exists) throw new ConflictException('Email sudah terdaftar')

    const hash = await bcrypt.hash(data.password, 12)
    const admin = await this.prisma.adminUser.create({
      data: { email: data.email, passwordHash: hash, fullName: data.fullName, role: data.role },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    })

    await this.audit.log({
      actorType: 'admin',
      actorId: creatorId,
      action: 'admin.create',
      resourceType: 'admin',
      resourceId: admin.id,
      metadata: { email: admin.email, role: admin.role },
    })

    return admin
  }

  async listAdmins() {
    return this.prisma.adminUser.findMany({
      select: { id: true, email: true, fullName: true, role: true, status: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  async toggleAdmin(adminId: string, actorId: string, status: 'active' | 'inactive') {
    const updated = await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { status },
      select: { id: true, email: true, status: true },
    })
    await this.audit.log({
      actorType: 'admin',
      actorId,
      action: `admin.${status === 'active' ? 'activate' : 'deactivate'}`,
      resourceType: 'admin',
      resourceId: adminId,
    })
    return updated
  }
}
