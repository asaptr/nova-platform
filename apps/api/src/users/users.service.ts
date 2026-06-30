import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        balance: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    })
    if (!user) throw new NotFoundException('User tidak ditemukan')
    return user
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, fullName: true, phone: true },
    })
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()

    const valid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!valid) throw new BadRequestException('Password lama salah')

    if (newPassword.length < 8) throw new BadRequestException('Password baru minimal 8 karakter')

    const hash = await bcrypt.hash(newPassword, 12)
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    })
    return { message: 'Password berhasil diubah' }
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    })
    if (!user) throw new NotFoundException()
    return { balance: user.balance }
  }
}
