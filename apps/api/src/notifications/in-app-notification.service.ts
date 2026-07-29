import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type NotifType =
  | 'ticket_created'
  | 'ticket_reply_user'
  | 'ticket_reply_admin'
  | 'topup_success'
  | 'topup_failed'

@Injectable()
export class InAppNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, type: NotifType, title: string, body: string, link?: string) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, link },
    })
  }

  async createForAdmins(type: NotifType, title: string, body: string, link?: string) {
    return this.prisma.notification.create({
      data: { userId: null, type, title, body, link },
    })
  }

  async getForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  }

  async getForAdmins() {
    return this.prisma.notification.findMany({
      where: { userId: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  }

  async getUnreadCountForUser(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } })
  }

  async getAdminUnreadCount() {
    return this.prisma.notification.count({ where: { userId: null, isRead: false } })
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } })
  }

  async markAllReadForUser(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })
  }

  async markAllReadForAdmins() {
    return this.prisma.notification.updateMany({ where: { userId: null, isRead: false }, data: { isRead: true } })
  }
}
