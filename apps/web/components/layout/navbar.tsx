'use client'
import { ThemeToggle } from './theme-toggle'
import { useEffect, useState } from 'react'
import { formatRupiah } from '@/lib/utils'
import api from '@/lib/api'
import { NotificationBell } from '@/components/ui/notification-bell'

export function Navbar() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    api.get('/users/me/balance').then(r => setBalance(Number(r.data.balance))).catch(() => {})
  }, [])

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-5">
      <div />
      <div className="flex items-center gap-3">
        {balance !== null && (
          <div className="text-sm">
            <span className="text-muted">Saldo: </span>
            <span className="font-semibold text-primary">{formatRupiah(balance)}</span>
          </div>
        )}
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
