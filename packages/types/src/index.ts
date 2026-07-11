export type VmStatus = 'pending' | 'provisioning' | 'running' | 'stopped' | 'suspended' | 'deleted' | 'failed' | 'starting' | 'stopping' | 'rebooting'
export type IpType = 'nat' | 'public'
export type UserStatus = 'active' | 'suspended' | 'banned'
export type TransactionType = 'topup' | 'debit' | 'refund' | 'adjustment'
export type TransactionStatus = 'pending' | 'success' | 'failed'
export type AdminRole = 'admin' | 'superadmin'
export type ActorType = 'user' | 'admin' | 'system'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Package {
  id: string
  name: string
  ipType: IpType
  vcpu: number
  ramMb: number
  diskGb: number
  bandwidthGb: number
  priceMonthly: number
  priceHourly: number
  isActive: boolean
}

export interface Vm {
  id: string
  displayId: string
  userId: string
  packageId: string
  hostname: string
  ipType: IpType
  status: VmStatus
  ipAddress?: string
  sshPort?: number
  osTemplate?: string
  proxmoxVmid?: number
  proxmoxNode?: string
  expiresAt?: string
  createdAt: string
  package?: Package
}

export interface User {
  id: string
  email: string
  fullName?: string
  phone?: string
  status: UserStatus
  balance: number
  emailVerifiedAt?: string
  createdAt: string
}

export interface AdminUser {
  id: string
  email: string
  fullName?: string
  role: AdminRole
  status: string
  lastLoginAt?: string
  createdAt: string
}

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  status: TransactionStatus
  paymentRef?: string
  gateway?: string
  notes?: string
  createdAt: string
}

export interface AuditLog {
  id: string
  actorType: ActorType
  actorId: string
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  createdAt: string
}

export interface Ticket {
  id: string
  userId: string
  vmId?: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  assignedTo?: string
  createdAt: string
  updatedAt: string
}

export interface TicketMessage {
  id: string
  ticketId: string
  senderType: 'user' | 'admin'
  senderId: string
  message: string
  createdAt: string
}

export interface NodeHealth {
  node: string
  status: 'online' | 'offline' | 'degraded'
  cpuPercent: number
  memTotal: number
  memUsed: number
  diskTotal: number
  diskUsed: number
  uptime: number
}

export interface CreateVmDto {
  packageId: string
  osTemplate: string
  hostname?: string
  rootPassword: string
}

export interface TopupDto {
  amount: number
  gateway: 'midtrans' | 'xendit'
}

export interface ApiResponse<T> {
  data?: T
  message?: string
  error?: string
  statusCode?: number
}
