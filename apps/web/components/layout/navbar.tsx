'use client'
import { ThemeToggle } from './theme-toggle'
import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRupiah } from '@/lib/utils'
import api from '@/lib/api'

export function Navbar() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    api.get('/users/me/balance').then(r => setBalance(Number(r.data.balance))).catch(() => {})
  }, [])

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-5">
      <div />
      <div className="flex items-center gap-3">
        {balance !== null && (
          <div className="text-sm">
            <span className="text-muted">Saldo: </span>
            <span className="font-semibold text-primary">{formatRupiah(balance)}</span>
          </div>
        )}
        <button className="p-2 rounded-md text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <Bell size={18} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
