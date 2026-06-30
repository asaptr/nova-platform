import { Test, TestingModule } from '@nestjs/testing'
import { AuthService } from './auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtService } from '@nestjs/jwt'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'
import { ConflictException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}
const mockJwt = { sign: jest.fn().mockReturnValue('mock-token') }
const mockNotifications = { sendEmailVerification: jest.fn() }
const mockAudit = { log: jest.fn() }

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })

  describe('register', () => {
    it('buat user baru dan kirim email verifikasi', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', fullName: 'Test User',
      })

      await service.register({ email: 'test@test.com', password: 'Pass@123!', fullName: 'Test User' })

      expect(mockPrisma.user.create).toHaveBeenCalled()
      expect(mockNotifications.sendEmailVerification).toHaveBeenCalled()
    })

    it('throw ConflictException jika email sudah terdaftar', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' })

      await expect(
        service.register({ email: 'test@test.com', password: 'Pass@123!', fullName: 'Test' }),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('login', () => {
    it('return tokens jika kredensial valid', async () => {
      const hash = await bcrypt.hash('Pass@123!', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', passwordHash: hash,
        status: 'active', role: 'user',
      })

      const result = await service.login({ email: 'test@test.com', password: 'Pass@123!' })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.login' }))
    })

    it('throw UnauthorizedException jika password salah', async () => {
      const hash = await bcrypt.hash('BenarPass@123!', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', passwordHash: hash,
        status: 'active', role: 'user',
      })

      await expect(
        service.login({ email: 'test@test.com', password: 'SalahPass' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throw UnauthorizedException jika user di-suspend', async () => {
      const hash = await bcrypt.hash('Pass@123!', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', passwordHash: hash,
        status: 'suspended', role: 'user',
      })

      await expect(
        service.login({ email: 'test@test.com', password: 'Pass@123!' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })
})
