'use client'
import Link from 'next/link'
import { Wallet, Plus } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'

export function BalanceCard({ balance }: { balance: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent/10">
          <Wallet size={18} className="text-accent" />
        </div>
        <div>
          <p className="text-xs text-muted">Saldo</p>
          <p className="text-xl font-bold">{formatRupiah(balance)}</p>
        </div>
      </div>
      <Link
        href="/billing/topup"
        className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
      >
        <Plus size={15} />
        Topup
      </Link>
    </div>
  )
}
