import { Controller, Get, Post, Body, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SystemConfigService } from './system-config.service'
import * as bcrypt from 'bcrypt'

@Controller('setup')
export class SetupController {
  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
  ) {}

  @Get('status')
  async getStatus() {
    const adminCount = await this.prisma.adminUser.count()
    return { installed: adminCount > 0 }
  }

  @Post('install')
  async install(@Body() body: any) {
    const adminCount = await this.prisma.adminUser.count()
    if (adminCount > 0) {
      throw new ForbiddenException('Nova has already been installed.')
    }

    const { branding, admin, proxmox, mikrotik, nat, smtp } = body

    if (!admin?.email || !admin?.password) {
      throw new BadRequestException('Email dan password admin wajib diisi.')
    }

    if (admin.password.length < 8) {
      throw new BadRequestException('Password admin minimal 8 karakter.')
    }

    const configs: Record<string, string> = {}

    if (branding?.name) configs['brand.name'] = branding.name
    if (branding?.tagline) configs['brand.tagline'] = branding.tagline
    if (branding?.timezone) configs['brand.timezone'] = branding.timezone
    if (branding?.domain_base) configs['domain.base'] = branding.domain_base

    if (proxmox?.host) configs['proxmox.host'] = proxmox.host
    if (proxmox?.port) configs['proxmox.port'] = proxmox.port || '8006'
    if (proxmox?.node) configs['proxmox.node'] = proxmox.node
    if (proxmox?.token_id) configs['proxmox.token_id'] = proxmox.token_id
    if (proxmox?.token_secret) configs['proxmox.token_secret'] = proxmox.token_secret

    if (mikrotik?.host) configs['mikrotik.host'] = mikrotik.host
    if (mikrotik?.user) configs['mikrotik.user'] = mikrotik.user
    if (mikrotik?.pass) configs['mikrotik.pass'] = mikrotik.pass

    if (nat?.bridge) configs['nat.bridge'] = nat.bridge
    if (nat?.gateway) configs['nat.gateway'] = nat.gateway
    if (nat?.network) configs['nat.network'] = nat.network
    if (nat?.public_ip) configs['nat.public_ip'] = nat.public_ip
    if (nat?.public_bridge) configs['public.bridge'] = nat.public_bridge

    if (smtp?.host) configs['smtp.host'] = smtp.host
    if (smtp?.port) configs['smtp.port'] = smtp.port
    if (smtp?.user) configs['smtp.user'] = smtp.user
    if (smtp?.pass) configs['smtp.pass'] = smtp.pass
    if (smtp?.email_from) configs['email.from'] = smtp.email_from

    await this.systemConfig.setMany(configs)

    const hash = await bcrypt.hash(admin.password, 12)
    await this.prisma.adminUser.create({
      data: {
        email: admin.email,
        passwordHash: hash,
        role: 'superadmin',
        fullName: 'Super Admin',
      },
    })

    const packageCount = await this.prisma.package.count()
    if (packageCount === 0) {
      await this.prisma.package.createMany({
        data: [
          { name: 'Nano NAT',     ipType: 'nat',    vcpu: 1, ramMb: 512,  diskGb: 10, bandwidthGb: 100, priceHourly: 50,  priceMonthly: 36000  },
          { name: 'Micro NAT',    ipType: 'nat',    vcpu: 1, ramMb: 1024, diskGb: 20, bandwidthGb: 200, priceHourly: 100, priceMonthly: 72000  },
          { name: 'Small Public', ipType: 'public', vcpu: 2, ramMb: 2048, diskGb: 40, bandwidthGb: 500, priceHourly: 300, priceMonthly: 216000 }
        ]
      })
    }

    return { success: true, message: 'Nova berhasil diinstal!' }
  }
}
