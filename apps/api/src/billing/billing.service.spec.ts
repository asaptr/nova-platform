import { Test, TestingModule } from '@nestjs/testing'
import { BillingService } from './billing.service'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { ProxmoxService } from '../proxmox/proxmox.service'
import { MikrotikService } from '../mikrotik/mikrotik.service'
import { AuditService } from '../audit/audit.service'

const mockPrisma = {
  vm: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  billingUsage: { create: jest.fn() },
  natPortForward: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
}

const mockNotifications = { sendLowBalanceWarning: jest.fn(), sendVmSuspended: jest.fn() }
const mockProxmox = { suspendVm: jest.fn(), deleteVm: jest.fn() }
const mockMikrotik = { disableSshForward: jest.fn() }
const mockAudit = { log: jest.fn() }

describe('BillingService', () => {
  let service: BillingService

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: ProxmoxService, useValue: mockProxmox },
        { provide: MikrotikService, useValue: mockMikrotik },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)
  })

  describe('handleHourlyBilling', () => {
    it('debit saldo user sesuai harga paket per jam', async () => {
      const vm = {
        id: 'vm-1', proxmoxVmid: 100, proxmoxNode: 'pve',
        userId: 'user-1', status: 'running',
        user: { id: 'user-1', email: 'test@test.com', balance: 10000 },
        package: { pricePerHour: 100 },
        natPortForwards: [],
      }
      mockPrisma.vm.findMany.mockResolvedValue([vm])
      mockPrisma.user.update.mockResolvedValue({ balance: 9900 })

      await service.handleHourlyBilling()

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ balance: { decrement: 100 } }),
        }),
      )
      expect(mockPrisma.billingUsage.create).toHaveBeenCalled()
    })

    it('suspend VM jika saldo tidak cukup', async () => {
      const vm = {
        id: 'vm-1', proxmoxVmid: 100, proxmoxNode: 'pve',
        userId: 'user-1', status: 'running',
        user: { id: 'user-1', email: 'test@test.com', balance: 50 },
        package: { pricePerHour: 100 },
        natPortForwards: [],
      }
      mockPrisma.vm.findMany.mockResolvedValue([vm])
      // Setelah debit, balance jadi negatif
      mockPrisma.user.update.mockResolvedValue({ balance: -50 })

      await service.handleHourlyBilling()

      expect(mockProxmox.suspendVm).toHaveBeenCalledWith('pve', 100)
      expect(mockPrisma.vm.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vm-1' },
          data: expect.objectContaining({ status: 'suspended' }),
        }),
      )
      expect(mockNotifications.sendVmSuspended).toHaveBeenCalled()
    })

    it('kirim warning jika saldo di bawah threshold', async () => {
      const LOW_THRESHOLD = 10000
      const vm = {
        id: 'vm-1', proxmoxVmid: 100, proxmoxNode: 'pve',
        userId: 'user-1', status: 'running',
        user: { id: 'user-1', email: 'test@test.com', balance: LOW_THRESHOLD + 100 },
        package: { pricePerHour: 100 },
        natPortForwards: [],
      }
      mockPrisma.vm.findMany.mockResolvedValue([vm])
      // Setelah debit, balance jadi tepat di bawah threshold
      mockPrisma.user.update.mockResolvedValue({ balance: LOW_THRESHOLD - 1 })

      await service.handleHourlyBilling()

      expect(mockNotifications.sendLowBalanceWarning).toHaveBeenCalledWith(
        'test@test.com',
        expect.any(Number),
      )
    })

    it('skip VM yang bukan status running', async () => {
      const vm = {
        id: 'vm-1', proxmoxVmid: 100, proxmoxNode: 'pve',
        userId: 'user-1', status: 'stopped',
        user: { id: 'user-1', email: 'test@test.com', balance: 10000 },
        package: { pricePerHour: 100 },
        natPortForwards: [],
      }
      mockPrisma.vm.findMany.mockResolvedValue([vm])

      await service.handleHourlyBilling()

      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })
})
