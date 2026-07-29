import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)
}

export function formatOsName(osTemplate: string | null | undefined): string {
  if (!osTemplate) return '—'
  if (osTemplate.includes('/')) {
    const filename = osTemplate.split('/').pop() ?? osTemplate
    return filename.replace(/\.iso$/i, '').replace(/-/g, ' ')
  }
  return osTemplate
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d)
}
