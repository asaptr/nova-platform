'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

const priorityColor: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
  medium: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  high: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  urgent: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('open')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    const { data } = await api.get(`/admin/tickets?${params}`)
    setTickets(data.items); setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tiket Dukungan ({total})</h1>
      </div>

      <div className="flex gap-2">
        {['', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-accent text-white' : 'border border-border text-muted hover:text-primary'
            }`}
          >
            {s === '' ? 'Semua' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-16 animate-pulse" />
          ))
        ) : tickets.map(t => (
          <Link key={t.id} href={`/tickets/${t.id}`}
            className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-accent/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{t.subject}</p>
                <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${priorityColor[t.priority] ?? ''}`}>{t.priority}</span>
              </div>
              <p className="text-xs text-muted mt-0.5">{t.user?.email} · {formatDate(t.createdAt)}</p>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                t.status === 'open' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                t.status === 'in_progress' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                'bg-gray-100 text-gray-600 dark:bg-gray-800'
              }`}>{t.status.replace('_', ' ')}</span>
              <p className="text-xs text-muted mt-1">{t._count?.messages ?? 0} pesan</p>
            </div>
          </Link>
        ))}
        {!loading && tickets.length === 0 && (
          <p className="text-center py-10 text-muted text-sm">Tidak ada tiket.</p>
        )}
      </div>
    </div>
  )
}
