'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { Pagination } from '@/components/ui/pagination'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('page', String(page))
    params.set('limit', pageSize === 0 ? '1000' : String(pageSize))
    const { data } = await api.get(`/admin/users?${params}`)
    setUsers(data.items)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [search, page, pageSize])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users ({total})</h1>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Cari nama atau email..."
        className="w-full max-w-sm border border-border rounded-lg px-3 py-2 text-sm bg-card outline-none focus:border-accent"
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['User', 'Saldo', 'VM Aktif', 'Status', 'Bergabung', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: Math.min(pageSize || 5, 5) }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-background rounded animate-pulse" /></td></tr>
              ))
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-background/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.fullName}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3 font-medium">{formatRupiah(u.balance)}</td>
                <td className="px-4 py-3 text-center">{u._count?.vms ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    u.status === 'active' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' :
                    u.status === 'suspended' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-800'
                  }`}>{u.status}</span>
                </td>
                <td className="px-4 py-3 text-muted text-xs">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/users/${u.id}`} className="text-accent hover:underline text-xs">Detail</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <p className="text-center py-10 text-muted text-sm">Tidak ada user ditemukan.</p>
        )}
        <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  )
}
