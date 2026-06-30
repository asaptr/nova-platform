'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { BalanceCard } from '@/components/billing/balance-card'
import { formatRupiah, formatDate } from '@/lib/utils'
import type { Transaction, User } from '@langitnode/types'
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'

const typeLabel: Record<string, string> = {
  topup: 'Topup', debit: 'Tagihan VM', refund: 'Refund', adjustment: 'Penyesuaian',
}

export default function BillingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/users/me'), api.get('/billing/transactions')])
      .then(([u, t]) => { setUser(u.data); setTxs(t.data.items) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold">Billing</h1>

      {user && <BalanceCard balance={Number(user.balance)} />}

      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Riwayat Transaksi</h2>
          <Link href="/billing/topup" className="text-sm text-accent hover:underline">+ Topup</Link>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-background rounded-lg animate-pulse" />)}
          </div>
        ) : txs.length === 0 ? (
          <p className="p-8 text-center text-muted text-sm">Belum ada transaksi.</p>
        ) : (
          <div className="divide-y divide-border">
            {txs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`p-2 rounded-full ${tx.type === 'topup' ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
                  {tx.type === 'topup'
                    ? <ArrowUpRight size={14} className="text-green-600" />
                    : <ArrowDownLeft size={14} className="text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{typeLabel[tx.type] ?? tx.type}</p>
                  <p className="text-xs text-muted">{formatDate(tx.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.type === 'topup' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'topup' ? '+' : '-'}{formatRupiah(Number(tx.amount))}
                  </p>
                  <p className={`text-xs ${tx.status === 'success' ? 'text-green-500' : tx.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
