import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Superadmin
  await prisma.adminUser.upsert({
    where: { email: 'superadmin@nova.local' },
    update: {},
    create: {
      email: 'superadmin@nova.local',
      passwordHash: await bcrypt.hash('Admin@123!', 12),
      role: 'superadmin',
    },
  })

  // Paket default — field sesuai schema.prisma
  await prisma.package.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Nano NAT',     ipType: 'nat',    vcpu: 1, ramMb: 512,  diskGb: 10, bandwidthGb: 100, priceHourly: 50,  priceMonthly: 36000  },
      { name: 'Micro NAT',    ipType: 'nat',    vcpu: 1, ramMb: 1024, diskGb: 20, bandwidthGb: 200, priceHourly: 100, priceMonthly: 72000  },
      { name: 'Small Public', ipType: 'public', vcpu: 2, ramMb: 2048, diskGb: 40, bandwidthGb: 500, priceHourly: 300, priceMonthly: 216000 },
    ],
  })

  console.log('Seed selesai.')
  await prisma.$disconnect()
}

main()
