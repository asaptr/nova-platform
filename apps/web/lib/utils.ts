import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatOsName(osTemplate: string | null | undefined): string {
  if (!osTemplate) return '—'
  // ISO path: e.g. local:iso/debian-13.5.0-amd64-netinst.iso
  if (osTemplate.includes('/')) {
    const filename = osTemplate.split('/').pop() ?? osTemplate
    return filename.replace(/\.iso$/i, '').replace(/-/g, ' ')
  }
  return osTemplate
}

export function timeAgo(date: string | Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}d lalu`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m lalu`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}j lalu`
  return `${Math.floor(seconds / 86400)}h lalu`
}
