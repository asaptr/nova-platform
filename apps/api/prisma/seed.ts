import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
const prisma = new PrismaClient()
async function main() {
    await prisma.adminUser.upsert({
        where: { email: 'superadmin@langitnode.id' },
        update: {},
        create: {
            email: 'superadmin@langitnode.id',
            passwordHash: await bcrypt.hash('Admin@123!', 12),
            role: 'superadmin',
        },
    })
    await prisma.package.createMany({
        skipDuplicates: true,
        data: [
            { name: 'Nano NAT', cpu: 1, ram: 512, disk: 10, pricePerHour: 50, ipType: 'nat', osTemplates: ['ubuntu-22.04-cloudinit'] },
            { name: 'Micro NAT', cpu: 1, ram: 1024, disk: 20, pricePerHour: 100, ipType: 'nat', osTemplates: ['ubuntu-22.04-cloudinit'] },
            { name: 'Small Public', cpu: 2, ram: 2048, disk: 40, pricePerHour: 300, ipType: 'public', osTemplates: ['ubuntu-22.04-cloudinit'] },
        ],
    })
    console.log('Seed selesai.')
    await prisma.$disconnect()
}
main()