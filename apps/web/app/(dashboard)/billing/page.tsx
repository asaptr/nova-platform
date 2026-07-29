'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { BalanceCard } from '@/components/billing/balance-card'
import { formatRupiah, formatDate } from '@/lib/utils'
import type { User } from '@nova/types'
import { ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'

type FilterType = 'all' | 'topup' | 'adjustment' | 'usage'

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'topup', label: 'Topup' },
  { value: 'adjustment', label: 'Penyesuaian' },
  { value: 'usage', label: 'Penggunaan Jam' },
]

const TX_LABEL: Record<string, string> = {
  topup: 'Topup Saldo',
  adjustment: 'Penyesuaian Admin',
  charge: 'Tagihan Hourly',
}

type Entry = {
  id: string
  kind: 'tx' | 'usage'
  type: string
  label: string
  date: string
  dateEnd?: string
  amount: number
  vmDisplayId?: string
  vmId?: string
  notes?: string
  status?: string
}

function formatShortDate(d: string) {
  const dt = new Date(d)
  return dt.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BillingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [txs, setTxs] = useState<any[]>([])
  const [usages, setUsages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [vmFilter, setVmFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data))
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/billing/transactions?limit=200').then(r => r.data.items),
      api.get('/billing/usage').then(r => r.data),
    ]).then(([t, u]) => {
      setTxs(t)
      setUsages(u)
    }).finally(() => setLoading(false))
  }, [])

  // Merge transactions + usages into unified sorted list
  const allEntries = useMemo<Entry[]>(() => {
    const txEntries: Entry[] = txs.map(tx => ({
      id: tx.id,
      kind: 'tx',
      type: tx.type,
      label: TX_LABEL[tx.type] ?? tx.type,
      date: tx.createdAt,
      amount: Number(tx.amount),
      notes: tx.notes,
      status: tx.status,
    }))
    const usageEntries: Entry[] = usages.map(u => ({
      id: u.id,
      kind: 'usage',
      type: 'usage',
      label: u.vm?.displayId ?? u.vmId?.slice(-8) ?? '—',
      date: u.periodStart,
      dateEnd: u.periodEnd,
      amount: -Number(u.amountCharged),
      vmDisplayId: u.vm?.displayId,
      vmId: u.vmId,
    }))
    return [...txEntries, ...usageEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [txs, usages])

  // Compute running balance (newest → oldest, starting from current balance)
  const entriesWithBalance = useMemo(() => {
    const balance = user ? Number(user.balance) : null
    if (balance === null) return allEntries.map(e => ({ ...e, balanceAfter: null as number | null }))
    let running = balance
    return allEntries.map(e => {
      const after = running
      running -= e.amount
      return { ...e, balanceAfter: after }
    })
  }, [allEntries, user])

  // Unique VMs in usage entries
  const vmOptions = useMemo(() => {
    const map = new Map<string, string>()
    usages.forEach(u => {
      if (u.vmId) map.set(u.vmId, u.vm?.displayId ?? u.vmId.slice(-8))
    })
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [usages])

  // Apply filters
  const filtered = useMemo(() => {
    return entriesWithBalance.filter(e => {
      if (filter === 'topup' && e.type !== 'topup') return false
      if (filter === 'adjustment' && e.type !== 'adjustment') return false
      if (filter === 'usage' && e.kind !== 'usage') return false
      if (vmFilter && e.vmId !== vmFilter) return false
      return true
    })
  }, [entriesWithBalance, filter, vmFilter])

  // Paginated slice
  const paginated = useMemo(() => {
    if (pageSize === 0) return filtered
    return filtered.slice((page - 1) * pageSize, page * pageSize)
  }, [filtered, page, pageSize])

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing</h1>
        <Link href="/billing/topup" className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg hover:opacity-90 transition-opacity">
          + Topup
        </Link>
      </div>

      {user && <BalanceCard balance={Number(user.balance)} />}

      <div className="bg-card border border-border rounded-xl">
        {/* Filter chips */}
        <div className="flex gap-1.5 px-4 py-3 border-b border-border flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setVmFilter(''); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f.value
                ? 'bg-accent text-white'
                : 'bg-background border border-border text-muted hover:text-primary'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* VM sub-filter */}
        {vmOptions.length > 0 && (filter === 'usage' || filter === 'all') && (
          <div className="flex gap-1.5 px-4 py-2.5 border-b border-border flex-wrap bg-background/50">
            <span className="text-xs text-muted self-center">VM:</span>
            <button
              onClick={() => { setVmFilter(''); setPage(1) }}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${vmFilter === ''
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-background border border-border text-muted hover:text-primary'}`}
            >
              Semua
            </button>
            {vmOptions.map(v => (
              <button
                key={v.id}
                onClick={() => { setVmFilter(vmFilter === v.id ? '' : v.id); setPage(1) }}
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium transition-colors ${vmFilter === v.id
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-background border border-border text-muted hover:text-primary'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* Unified list */}
        {loading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-background rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-muted text-sm">Tidak ada data.</p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {paginated.map(entry => {
                const isCredit = entry.amount >= 0
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`p-2 rounded-full flex-shrink-0 ${
                      entry.kind === 'usage'
                        ? 'bg-blue-50 dark:bg-blue-950'
                        : isCredit ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'
                    }`}>
                      {entry.kind === 'usage'
                        ? <Clock size={14} className="text-blue-500" />
                        : isCredit
                          ? <ArrowUpRight size={14} className="text-green-600" />
                          : <ArrowDownLeft size={14} className="text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.kind === 'usage' ? (
                          <span className="font-mono">{entry.label}</span>
                        ) : entry.label}
                      </p>
                      {entry.notes && <p className="text-xs text-muted truncate">{entry.notes}</p>}
                      <p className="text-xs text-muted">
                        {entry.dateEnd
                          ? `${formatShortDate(entry.date)} → ${formatShortDate(entry.dateEnd)}`
                          : formatDate(entry.date)
                        }
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                        {isCredit ? '+' : ''}{formatRupiah(entry.amount)}
                      </p>
                      {entry.balanceAfter !== null && (
                        <p className={`text-xs ${entry.balanceAfter < 0 ? 'text-red-400' : 'text-muted'}`}>
                          Sisa {formatRupiah(entry.balanceAfter)}
                        </p>
                      )}
                      {entry.status && (
                        <p className={`text-xs ${entry.status === 'success' ? 'text-green-500' : entry.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>
                          {entry.status}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>
    </div>
  )
}
