import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name)
  private readonly baseUrl: string
  private readonly serverKey: string

  constructor(private config: ConfigService) {
    const isProduction = config.get('MIDTRANS_IS_PRODUCTION') === 'true'
    this.baseUrl = isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2'
    this.serverKey = config.get('MIDTRANS_SERVER_KEY')
  }

  private get authHeader() {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`
  }

  async createTransaction(orderId: string, amount: number, customerEmail: string) {
    const { data } = await axios.post(
      `${this.baseUrl}/charge`,
      {
        payment_type: 'bank_transfer',
        transaction_details: { order_id: orderId, gross_amount: amount },
        customer_details: { email: customerEmail },
        bank_transfer: { bank: 'bca' },
      },
      { headers: { Authorization: this.authHeader } },
    )
    return data
  }

  verifySignature(orderId: string, statusCode: string, grossAmount: string, signature: string): boolean {
    const crypto = require('crypto')
    const serverKey = this.serverKey
    const hash = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex')
    return hash === signature
  }
}
