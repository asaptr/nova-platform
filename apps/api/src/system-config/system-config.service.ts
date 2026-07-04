import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface BrandConfig {
  name: string
  tagline: string
  logoUrl: string
}

const DEFAULTS: Record<string, string> = {
  'brand.name': '',
  'brand.tagline': 'Node Orchestration & Virtualization Architecture',
  'brand.logo_url': '',
  'domain.base': '',
  'proxmox.host': '',
  'proxmox.port': '8006',
  'proxmox.node': '',
  'proxmox.token_id': '',
  'proxmox.token_secret': '',
  'proxmox.verify_ssl': 'false',
  'mikrotik.host': '',
  'mikrotik.user': '',
  'mikrotik.pass': '',
  'nat.bridge': 'vmbr1',
  'nat.gateway': '10.20.0.1',
  'nat.public_ip': '',
}

const MASKED = '••••••••'
const SENSITIVE_SUFFIXES = ['.pass', '.secret', '.token_secret', '.password']

function isSensitive(key: string): boolean {
  return SENSITIVE_SUFFIXES.some(s => key.endsWith(s))
}

@Injectable()
export class SystemConfigService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const existing = await this.prisma.systemConfig.findMany({ select: { key: true } })
    const existingKeys = new Set(existing.map(e => e.key))
    const toCreate = Object.entries(DEFAULTS).filter(([k]) => !existingKeys.has(k))
    if (toCreate.length > 0) {
      await this.prisma.systemConfig.createMany({
        data: toCreate.map(([key, value]) => ({ key, value })),
        skipDuplicates: true,
      })
    }
  }

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } })
    return row?.value ?? null
  }

  async getMany(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany({ where: { key: { in: keys } } })
    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return result
  }

  async set(key: string, value: string, adminId?: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value, updatedBy: adminId },
      create: { key, value, updatedBy: adminId },
    })
  }

  async setMany(data: Record<string, string>, adminId?: string): Promise<void> {
    await Promise.all(
      Object.entries(data).map(([key, value]) => this.set(key, value, adminId)),
    )
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany()
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = isSensitive(row.key) && row.value ? MASKED : row.value
    }
    return result
  }

  async getBrandConfig(): Promise<BrandConfig> {
    const keys = ['brand.name', 'brand.tagline', 'brand.logo_url']
    const cfg = await this.getMany(keys)
    return {
      name: cfg['brand.name'] || '',
      tagline: cfg['brand.tagline'] || 'Node Orchestration & Virtualization Architecture',
      logoUrl: cfg['brand.logo_url'] || '',
    }
  }

  isMasked(value: string): boolean {
    return value === MASKED
  }

  getMaskedPlaceholder(): string {
    return MASKED
  }
}
