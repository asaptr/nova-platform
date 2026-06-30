'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

type Tab = 'overview' | 'vms' | 'transactions' | 'audit'

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [role, setRole] = useState('')

  useEffect(() => {
    setRole(localStorage.getItem('admin_role') ?? '')
    api.get(`/admin/users/${id}`).then(r => { setUser(r.data); setLoading(false) })
  }, [id])

  async function toggleStatus() {
    const newStatus = user.status === 'active' ? 'suspended' : 'active'
    await api.patch(`/admin/users/${id}/status`, { status: newStatus })
    setUser((u: any) => ({ ...u, status: newStatus }))
    setMsg(`User berhasil di-${newStatus === 'active' ? 'aktifkan' : 'suspend'}`)
  }

  async function adjustBalance() {
    try {
      await api.post(`/admin/finance/adjust-balance`, { userId: id, amount: Number(adjustAmount), note: adjustNote })
      setMsg('Saldo berhasil disesuaikan')
      setAdjustAmount(''); setAdjustNote('')
      const { data } = await api.get(`/admin/users/${id}`)
      setUser(data)
    } catch (e: any) {
      setMsg(e.response?.data?.message ?? 'Gagal')
    }
  }

  if (loading) return <div className="text-sm text-muted">Memuat...</div>
  if (!user) return <div className="text-sm text-red-500">User tidak ditemukan.</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'vms', label: `VM (${user.vms?.length ?? 0})` },
    { key: 'transactions', label: `Transaksi (${user.transactions?.length ?? 0})` },
    { key: 'audit', label: `Audit Log (${user.auditLogs?.length ?? 0})` },
  ]

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/users" className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{user.fullName}</h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded font-medium ${
          user.status === 'active' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-amber-50 text-amber-700'
        }`}>{user.status}</span>
      </div>

      {msg && (
        <div className="p-3 rounded-lg text-sm bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          {msg}
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-accent text-white' : 'text-muted hover:text-primary'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-sm">Informasi Akun</h2>
            <dl className="space-y-2 text-sm">
              {[
                ['ID', user.id],
                ['Email', user.email],
                ['Nama Lengkap', user.fullName],
                ['Saldo', formatRupiah(user.balance)],
                ['Status', user.status],
                ['Email Terverifikasi', user.isEmailVerified ? 'Ya' : 'Belum'],
                ['Bergabung', formatDate(user.createdAt)],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-mono text-right text-xs">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {role === 'superadmin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Toggle status */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-sm">Kelola Status</h2>
                <button onClick={toggleStatus}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                    user.status === 'active'
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {user.status === 'active' ? 'Suspend User' : 'Aktifkan User'}
                </button>
              </div>

              {/* Adjust balance */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-sm">Sesuaikan Saldo</h2>
                <input value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="Jumlah (negatif untuk debit)"
                  type="number"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
                />
                <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Catatan (opsional)"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
                />
                <button onClick={adjustBalance} disabled={!adjustAmount}
                  className="w-full bg-accent text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
                >
                  Terapkan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'vms' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['VM', 'Status', 'Paket', 'IP', 'Dibuat'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(user.vms ?? []).map((vm: any) => (
                <tr key={vm.id} className="hover:bg-background/50">
                  <td className="px-4 py-3">
                    <Link href={`/vms/${vm.id}`} className="text-accent hover:underline font-medium">{vm.hostname}</Link>
                    <p className="text-xs text-muted">{vm.displayId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{vm.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{vm.package?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{vm.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(vm.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(user.vms ?? []).length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada VM.</p>}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Tipe', 'Jumlah', 'Status', 'Keterangan', 'Tanggal'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(user.transactions ?? []).map((tx: any) => (
                <tr key={tx.id} className="hover:bg-background/50">
                  <td className="px-4 py-3 capitalize">{tx.type}</td>
                  <td className={`px-4 py-3 font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatRupiah(tx.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{tx.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{tx.description ?? '—'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(tx.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(user.transactions ?? []).length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada transaksi.</p>}
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Aksi', 'Resource', 'Actor', 'Waktu'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(user.auditLogs ?? []).map((log: any) => (
                <tr key={log.id} className="hover:bg-background/50">
                  <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-xs text-muted">{log.resourceType}:{log.resourceId?.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs">{log.actorType}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(user.auditLogs ?? []).length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada log.</p>}
        </div>
      )}
    </div>
  )
}
