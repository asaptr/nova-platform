import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private transporter: nodemailer.Transporter

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: parseInt(config.get('SMTP_PORT') ?? '587'),
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASS'),
      },
    })
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM'),
        to,
        subject,
        html,
      })
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`)
    }
  }

  async sendEmailVerification(email: string, token: string) {
    const url = `${this.config.get('FRONTEND_URL')}/verify-email?token=${token}`
    await this.send(email, 'Verifikasi Email', `
      <h2>Verifikasi Email Anda</h2>
      <p>Klik link berikut untuk verifikasi email:</p>
      <a href="${url}">${url}</a>
      <p>Link berlaku 24 jam.</p>
    `)
  }

  async sendVmReady(email: string, vm: { displayId: string; hostname: string; ipAddress: string; sshPort: number; ipType: string }) {
    const sshCmd = vm.ipType === 'nat'
      ? `ssh root@${vm.ipAddress} -p ${vm.sshPort}`
      : `ssh root@${vm.ipAddress}`

    await this.send(email, `VM ${vm.hostname} Siap Digunakan`, `
      <h2>VM Anda Sudah Siap!</h2>
      <p>VM <strong>${vm.hostname}</strong> (${vm.displayId}) berhasil dibuat.</p>
      <p><strong>IP:</strong> ${vm.ipAddress}</p>
      ${vm.ipType === 'nat' ? `<p><strong>Port SSH:</strong> ${vm.sshPort}</p>` : ''}
      <p><strong>Perintah SSH:</strong></p>
      <code>${sshCmd}</code>
      <p>Login dengan password yang Anda set saat membuat VM.</p>
    `)
  }

  async sendTopupSuccess(email: string, amount: number) {
    const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
    await this.send(email, 'Topup Berhasil', `
      <h2>Topup Berhasil</h2>
      <p>Saldo Anda berhasil ditambahkan sebesar <strong>${formatted}</strong>.</p>
    `)
  }

  async sendLowBalanceWarning(email: string, balance: number) {
    const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(balance)
    await this.send(email, 'Peringatan: Saldo Hampir Habis', `
      <h2>Saldo Anda Hampir Habis</h2>
      <p>Saldo saat ini: <strong>${formatted}</strong></p>
      <p>Segera topup untuk menghindari VM Anda di-suspend otomatis.</p>
    `)
  }

  async sendVmSuspended(email: string, vmHostname: string) {
    await this.send(email, `VM ${vmHostname} Di-suspend`, `
      <h2>VM Anda Di-suspend</h2>
      <p>VM <strong>${vmHostname}</strong> di-suspend karena saldo habis.</p>
      <p>Topup saldo dalam 7 hari untuk mengaktifkan kembali. Lewat dari itu VM akan dihapus permanen.</p>
    `)
  }
}
