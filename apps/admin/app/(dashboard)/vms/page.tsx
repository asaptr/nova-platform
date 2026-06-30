'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

const statusColor: Record<string, string> = {
  running: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  stopped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspended: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  provisioning: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export default function AdminVmsPage() {
  const [vms, setVms] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    const { data } = await api.get(`/admin/vms?${params}`)
    setVms(data.items); setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, status])

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
          {['running','stopped','suspended','provisioning','failed'].map(s => (
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
              Array.from({length: 5}).map((_, i) => (
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
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[vm.status] ?? ''}`}>{vm.status}</span>
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
      </div>
    </div>
  )
}
