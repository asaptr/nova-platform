import { Module } from '@nestjs/common'
import { MidtransService } from './midtrans.service'
import { PaymentController } from './payment.controller'

@Module({
  providers: [MidtransService],
  controllers: [PaymentController],
  exports: [MidtransService],
})
export class PaymentModule {}
