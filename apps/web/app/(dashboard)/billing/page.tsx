'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { BalanceCard } from '@/components/billing/balance-card'
import { formatRupiah, formatDate } from '@/lib/utils'
import type { Transaction, User } from '@langitnode/types'
import { ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'

const TX_TYPES = [
  { value: '', label: 'Semua' },
  { value: 'topup', label: 'Topup' },
  { value: 'adjustment', label: 'Penyesuaian' },
]

const typeLabel: Record<string, string> = {
  topup: 'Topup Saldo',
  adjustment: 'Penyesuaian Admin',
  charge: 'Tagihan Hourly',
}

type Tab = 'transactions' | 'usage'

export default function BillingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [usages, setUsages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('transactions')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data))
  }, [])

  useEffect(() => {
    setLoading(true)
    if (tab === 'transactions') {
      const params = typeFilter ? `?type=${typeFilter}` : ''
      api.get(`/billing/transactions${params}`)
        .then(r => setTxs(r.data.items))
        .finally(() => setLoading(false))
    } else {
      api.get('/billing/usage')
        .then(r => setUsages(r.data))
        .finally(() => setLoading(false))
    }
  }, [tab, typeFilter])

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold">Billing</h1>

      {user && <BalanceCard balance={Number(user.balance)} />}

      <div className="bg-card border border-border rounded-xl">
        {/* Tabs */}
        <div className="flex border-b border-border">
          {([
            { key: 'transactions', label: 'Transaksi' },
            { key: 'usage', label: 'Penggunaan Jam' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-primary'}`}
            >
              {t.label}
            </button>
          ))}
          {tab === 'transactions' && (
            <div className="ml-auto px-4 flex items-center">
              <Link href="/billing/topup" className="text-sm text-accent hover:underline">+ Topup</Link>
            </div>
          )}
        </div>

        {/* Transaction type filter */}
        {tab === 'transactions' && (
          <div className="flex gap-1.5 px-4 py-3 border-b border-border flex-wrap">
            {TX_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === t.value
                  ? 'bg-accent text-white'
                  : 'bg-background border border-border text-muted hover:text-primary'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Transaction list */}
        {tab === 'transactions' && (
          loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-background rounded-lg animate-pulse" />)}
            </div>
          ) : txs.length === 0 ? (
            <p className="p-8 text-center text-muted text-sm">Tidak ada transaksi.</p>
          ) : (
            <div className="divide-y divide-border">
              {txs.map(tx => {
                const amount = Number(tx.amount)
                const isCredit = amount >= 0
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`p-2 rounded-full ${isCredit ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
                      {isCredit
                        ? <ArrowUpRight size={14} className="text-green-600" />
                        : <ArrowDownLeft size={14} className="text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{typeLabel[tx.type] ?? tx.type}</p>
                      {tx.notes && <p className="text-xs text-muted truncate">{tx.notes}</p>}
                      <p className="text-xs text-muted">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                        {isCredit ? '+' : ''}{formatRupiah(amount)}
                      </p>
                      <p className={`text-xs ${tx.status === 'success' ? 'text-green-500' : tx.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Usage list */}
        {tab === 'usage' && (
          loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-background rounded-lg animate-pulse" />)}
            </div>
          ) : usages.length === 0 ? (
            <p className="p-8 text-center text-muted text-sm">Belum ada catatan penggunaan.</p>
          ) : (
            <div className="divide-y divide-border">
              {usages.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-950">
                    <Clock size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-mono">{u.vmId?.slice(-8)}</p>
                    <p className="text-xs text-muted">
                      {formatDate(u.periodStart)} → {formatDate(u.periodEnd)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-red-500">−{formatRupiah(Number(u.amountCharged))}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
