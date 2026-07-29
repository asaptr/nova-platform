import { Controller, Post, Body, Get, Query, UseGuards, BadRequestException, Logger } from '@nestjs/common'
import { MidtransService } from './midtrans.service'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { InAppNotificationService } from '../notifications/in-app-notification.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name)

  constructor(
    private midtrans: MidtransService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private inAppNotif: InAppNotificationService,
  ) {}

  @Post('topup')
  @UseGuards(JwtAuthGuard)
  async createTopup(
    @CurrentUser('sub') userId: string,
    @Body() body: { amount: number },
  ) {
    if (body.amount < 10000) throw new BadRequestException('Minimal topup Rp 10.000')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const orderId = `topup-${userId}-${Date.now()}`

    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'topup',
        amount: body.amount,
        status: 'pending',
        paymentRef: orderId,
        gateway: 'midtrans',
      },
    })

    const midtransData = await this.midtrans.createTransaction(orderId, body.amount, user.email)

    return {
      transactionId: tx.id,
      orderId,
      paymentData: midtransData,
    }
  }

  @Post('webhook/midtrans')
  async midtransWebhook(@Body() body: any) {
    this.logger.log(`Midtrans webhook: ${body.transaction_status} for ${body.order_id}`)

    const valid = this.midtrans.verifySignature(
      body.order_id,
      body.status_code,
      body.gross_amount,
      body.signature_key,
    )
    if (!valid) {
      this.logger.warn('Invalid webhook signature')
      return { received: false }
    }

    if (body.transaction_status === 'settlement' || body.transaction_status === 'capture') {
      const tx = await this.prisma.transaction.findFirst({
        where: { paymentRef: body.order_id, status: 'pending' },
        include: { user: true },
      })
      if (!tx) return { received: true }

      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: tx.id },
          data: { status: 'success' },
        }),
        this.prisma.user.update({
          where: { id: tx.userId },
          data: { balance: { increment: tx.amount } },
        }),
      ])

      const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(tx.amount))
      await this.notifications.sendTopupSuccess(tx.user.email, Number(tx.amount))
      await this.inAppNotif.createForUser(
        tx.userId,
        'topup_success',
        'Topup Berhasil',
        `Saldo Anda berhasil ditambahkan sebesar ${fmt}.`,
        '/billing',
      )
      this.logger.log(`Topup success: ${tx.amount} for user ${tx.userId}`)
    } else if (body.transaction_status === 'deny' || body.transaction_status === 'cancel' || body.transaction_status === 'expire') {
      const tx = await this.prisma.transaction.findFirst({
        where: { paymentRef: body.order_id, status: 'pending' },
      })
      if (tx) {
        await this.prisma.transaction.update({ where: { id: tx.id }, data: { status: 'failed' } })
        await this.inAppNotif.createForUser(
          tx.userId,
          'topup_failed',
          'Topup Gagal',
          'Pembayaran topup tidak berhasil. Silakan coba lagi.',
          '/billing',
        )
      }
    }

    return { received: true }
  }
}
