'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Pagination } from '@/components/ui/pagination'

const POLL_INTERVAL = 3000
const TRANSIENT = new Set(['pending', 'provisioning', 'starting', 'stopping', 'rebooting'])

const statusColor: Record<string, string> = {
  running: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  stopped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspended: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  provisioning: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  pending: 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

function StatusCell({ vm }: { vm: any }) {
  const isTransient = TRANSIENT.has(vm.status)
  return (
    <div className="space-y-1">
      <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[vm.status] ?? ''}`}>
        {vm.status}
      </span>
      {isTransient && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-700"
                style={{ width: `${vm.provisionProgress ?? 0}%` }}
              />
            </div>
            <span className="text-[10px] text-accent font-medium w-6 text-right">
              {vm.provisionProgress ?? 0}%
            </span>
          </div>
          {vm.provisionStep && (
            <p className="text-[10px] text-muted truncate max-w-[160px]">{vm.provisionStep}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminVmsPage() {
  const [vms, setVms] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(resetLoading = false) {
    if (resetLoading) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('limit', pageSize === 0 ? '1000' : String(pageSize))
      const { data } = await api.get(`/admin/vms?${params}`)
      setVms(data.items)
      setTotal(data.total)

      const hasTransient = data.items.some((v: any) => TRANSIENT.has(v.status))
      if (hasTransient) {
        timerRef.current = setTimeout(() => load(), POLL_INTERVAL)
      }
    } finally {
      if (resetLoading) setLoading(false)
    }
  }

  useEffect(() => { setPage(1) }, [search, status])
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    load(true)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [search, status, page, pageSize])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Semua VM ({total})</h1>
      </div>

      <div className="flex gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari VM atau email user..."
          className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-card outline-none focus:border-accent"
        />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card outline-none focus:border-accent"
        >
          <option value="">Semua Status</option>
          {['running','stopped','suspended','provisioning','pending','failed'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['VM', 'Owner', 'Status', 'Node', 'Paket', 'IP', 'Dibuat', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({length: Math.min(pageSize || 5, 5)}).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-background rounded animate-pulse" /></td></tr>
              ))
            ) : vms.map(vm => (
              <tr key={vm.id} className="hover:bg-background/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{vm.hostname}</p>
                  <p className="text-xs text-muted">{vm.displayId}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{vm.user?.fullName ?? '—'}</p>
                  <p className="text-xs text-muted">{vm.user?.email}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusCell vm={vm} />
                </td>
                <td className="px-4 py-3 text-muted">{vm.proxmoxNode ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{vm.package?.name ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{vm.ipAddress ?? '—'}</td>
                <td className="px-4 py-3 text-muted text-xs">{formatDate(vm.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/vms/${vm.id}`} className="text-accent hover:underline text-xs">Detail</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && vms.length === 0 && (
          <p className="text-center py-10 text-muted text-sm">Tidak ada VM ditemukan.</p>
        )}
        <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  )
}
