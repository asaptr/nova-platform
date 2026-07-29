'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'vm.create':          { label: 'Buat VM',           color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  'vm.delete':          { label: 'Hapus VM',           color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  'vm.start':           { label: 'Nyalakan VM',        color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  'vm.stop':            { label: 'Matikan VM',         color: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  'vm.reboot':          { label: 'Restart VM',         color: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  'vm.terminal_access': { label: 'Akses Terminal SSH', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  'vm.console_access':  { label: 'Akses Web Console',  color: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  'vm.reset_password':  { label: 'Ganti Password',     color: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  'vm.suspend':         { label: 'Suspend (Billing)',  color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  'settings.update':    { label: 'Ubah Pengaturan',    color: 'bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400' },
  'user.login':         { label: 'Login',              color: 'bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400' },
  'user.register':      { label: 'Registrasi',         color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  'user.suspend':       { label: 'Suspend User',       color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  'user.activate':      { label: 'Aktifkan User',      color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
}

const VM_STATUS_COLOR: Record<string, string> = {
  running:      'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  stopped:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspended:    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  deleted:      'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
  failed:       'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  pending:      'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400',
  provisioning: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
}

const TX_STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  failed:  'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const VM_STATUSES = ['running', 'stopped', 'suspended', 'deleted', 'failed', 'pending', 'provisioning']

function AuditActionBadge({ action }: { action: string }) {
  const info = ACTION_LABELS[action]
  if (info) return <span className={`text-xs px-2 py-0.5 rounded font-medium ${info.color}`}>{info.label}</span>
  return <span className="text-xs font-mono text-muted">{action}</span>
}

function FilterChips({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        onClick={() => onChange('')}
        className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${value === ''
          ? 'bg-accent text-white' : 'bg-background border border-border text-muted hover:text-primary'}`}
      >Semua</button>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(value === o.value ? '' : o.value)}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${value === o.value
            ? 'bg-accent text-white' : 'bg-background border border-border text-muted hover:text-primary'}`}
        >{o.label}</button>
      ))}
    </div>
  )
}

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

  // VM tab filters
  const [vmStatusFilter, setVmStatusFilter] = useState('')
  const [vmPackageFilter, setVmPackageFilter] = useState('')
  const [vmDateFrom, setVmDateFrom] = useState('')
  const [vmDateTo, setVmDateTo] = useState('')
  const [vmPage, setVmPage] = useState(1)
  const [vmPageSize, setVmPageSize] = useState(25)

  // Audit tab filters
  const [auditVmFilter, setAuditVmFilter] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [auditPageSize, setAuditPageSize] = useState(25)

  // Tx tab
  const [txPage, setTxPage] = useState(1)
  const [txPageSize, setTxPageSize] = useState(25)

  useEffect(() => {
    setRole(localStorage.getItem('admin_role') ?? '')
    api.get(`/admin/users/${id}`).then(r => {
      const { user, vms, transactions, auditLogs } = r.data
      setUser({ ...user, vms, transactions, auditLogs })
      setLoading(false)
    })
  }, [id])

  async function toggleStatus() {
    const newStatus = user.status === 'active' ? 'suspended' : 'active'
    await api.patch(`/admin/users/${id}/status`, { status: newStatus })
    setUser((u: any) => ({ ...u, status: newStatus }))
    setMsg(`User berhasil di-${newStatus === 'active' ? 'aktifkan' : 'suspend'}`)
  }

  async function adjustBalance() {
    try {
      await api.post(`/admin/finance/users/${id}/adjust-balance`, { amount: Number(adjustAmount), notes: adjustNote })
      setMsg('Saldo berhasil disesuaikan')
      setAdjustAmount(''); setAdjustNote('')
      const { data } = await api.get(`/admin/users/${id}`)
      setUser({ ...data.user, vms: data.vms, transactions: data.transactions, auditLogs: data.auditLogs })
    } catch (e: any) {
      setMsg(e.response?.data?.message ?? 'Gagal')
    }
  }

  // VM filters
  const allVms: any[] = useMemo(() => user?.vms ?? [], [user])
  const vmPackageOptions = useMemo(() => {
    const map = new Map<string, string>()
    allVms.forEach(v => { if (v.package) map.set(v.package.id, v.package.name) })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [allVms])
  const filteredVms = useMemo(() => allVms.filter(v => {
    if (vmStatusFilter && v.status !== vmStatusFilter) return false
    if (vmPackageFilter && v.package?.id !== vmPackageFilter) return false
    if (vmDateFrom && new Date(v.createdAt) < new Date(vmDateFrom)) return false
    if (vmDateTo && new Date(v.createdAt) > new Date(vmDateTo + 'T23:59:59')) return false
    return true
  }), [allVms, vmStatusFilter, vmPackageFilter, vmDateFrom, vmDateTo])
  const pagedVms = vmPageSize === 0 ? filteredVms : filteredVms.slice((vmPage - 1) * vmPageSize, vmPage * vmPageSize)

  // Audit filters
  const allAuditLogs: any[] = useMemo(() => user?.auditLogs ?? [], [user])
  const auditVmOptions = useMemo(() => {
    const map = new Map<string, string>()
    allAuditLogs.forEach(l => {
      const name = l.metadata?.displayId
      if (name) map.set(name, name)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [allAuditLogs])
  const auditActionOptions = useMemo(() => {
    const seen = new Set<string>()
    allAuditLogs.forEach(l => seen.add(l.action))
    return Array.from(seen).map(a => ({ value: a, label: ACTION_LABELS[a]?.label ?? a }))
  }, [allAuditLogs])
  const filteredAuditLogs = useMemo(() => allAuditLogs.filter(l => {
    if (auditVmFilter && l.metadata?.displayId !== auditVmFilter) return false
    if (auditActionFilter && l.action !== auditActionFilter) return false
    if (auditDateFrom && new Date(l.createdAt) < new Date(auditDateFrom)) return false
    if (auditDateTo && new Date(l.createdAt) > new Date(auditDateTo + 'T23:59:59')) return false
    return true
  }), [allAuditLogs, auditVmFilter, auditActionFilter, auditDateFrom, auditDateTo])
  const pagedAuditLogs = auditPageSize === 0 ? filteredAuditLogs : filteredAuditLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize)

  // Tx
  const allTxs: any[] = useMemo(() => user?.transactions ?? [], [user])
  const pagedTxs = txPageSize === 0 ? allTxs : allTxs.slice((txPage - 1) * txPageSize, txPage * txPageSize)

  if (loading) return <div className="text-sm text-muted">Memuat...</div>
  if (!user) return <div className="text-sm text-red-500">User tidak ditemukan.</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'vms', label: `VM (${allVms.length})` },
    { key: 'transactions', label: `Transaksi (${allTxs.length})` },
    { key: 'audit', label: `Audit Log (${allAuditLogs.length})` },
  ]

  const inputCls = 'border border-border rounded-lg px-2.5 py-1 text-xs bg-background outline-none focus:border-accent'

  return (
    <div className="space-y-5 max-w-5xl">
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

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-sm">Sesuaikan Saldo</h2>
                <input value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="Jumlah (negatif untuk debit)" type="number"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
                />
                <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Catatan (opsional)"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
                />
                <button onClick={adjustBalance} disabled={!adjustAmount}
                  className="w-full bg-accent text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
                >Terapkan</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'vms' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* VM Filters */}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
              <div className="space-y-1">
                <p className="text-[10px] text-muted uppercase font-medium">Status</p>
                <FilterChips
                  value={vmStatusFilter}
                  onChange={v => { setVmStatusFilter(v); setVmPage(1) }}
                  options={VM_STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              {vmPackageOptions.length > 1 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted uppercase font-medium">Paket</p>
                  <FilterChips
                    value={vmPackageFilter}
                    onChange={v => { setVmPackageFilter(v); setVmPage(1) }}
                    options={vmPackageOptions}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-muted uppercase font-medium">Tanggal Dibuat:</span>
              <input type="date" value={vmDateFrom} onChange={e => { setVmDateFrom(e.target.value); setVmPage(1) }} className={inputCls} />
              <span className="text-xs text-muted">–</span>
              <input type="date" value={vmDateTo} onChange={e => { setVmDateTo(e.target.value); setVmPage(1) }} className={inputCls} />
              {(vmDateFrom || vmDateTo) && (
                <button onClick={() => { setVmDateFrom(''); setVmDateTo(''); setVmPage(1) }}
                  className="text-xs text-muted hover:text-red-500 transition-colors">✕ Reset</button>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['VM', 'Status', 'Paket', 'IP', 'Dibuat'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedVms.map((vm: any) => (
                <tr key={vm.id} className="hover:bg-background/50">
                  <td className="px-4 py-3">
                    <Link href={`/vms/${vm.id}`} className="text-accent hover:underline font-medium">{vm.hostname}</Link>
                    <p className="text-xs text-muted">{vm.displayId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${VM_STATUS_COLOR[vm.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}>{vm.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{vm.package?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{vm.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(vm.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredVms.length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada VM.</p>}
          <Pagination total={filteredVms.length} page={vmPage} pageSize={vmPageSize} onPage={setVmPage} onPageSize={setVmPageSize} />
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
              {pagedTxs.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-background/50">
                  <td className="px-4 py-3 capitalize">{tx.type}</td>
                  <td className={`px-4 py-3 font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatRupiah(tx.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TX_STATUS_COLOR[tx.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}>{tx.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{tx.description ?? '—'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(tx.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allTxs.length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada transaksi.</p>}
          <Pagination total={allTxs.length} page={txPage} pageSize={txPageSize} onPage={setTxPage} onPageSize={setTxPageSize} />
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Audit Filters */}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            {auditVmOptions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted uppercase font-medium">VM</p>
                <FilterChips
                  value={auditVmFilter}
                  onChange={v => { setAuditVmFilter(v); setAuditPage(1) }}
                  options={auditVmOptions}
                />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[10px] text-muted uppercase font-medium">Aksi</p>
              <FilterChips
                value={auditActionFilter}
                onChange={v => { setAuditActionFilter(v); setAuditPage(1) }}
                options={auditActionOptions}
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-muted uppercase font-medium">Waktu:</span>
              <input type="date" value={auditDateFrom} onChange={e => { setAuditDateFrom(e.target.value); setAuditPage(1) }} className={inputCls} />
              <span className="text-xs text-muted">–</span>
              <input type="date" value={auditDateTo} onChange={e => { setAuditDateTo(e.target.value); setAuditPage(1) }} className={inputCls} />
              {(auditDateFrom || auditDateTo) && (
                <button onClick={() => { setAuditDateFrom(''); setAuditDateTo(''); setAuditPage(1) }}
                  className="text-xs text-muted hover:text-red-500 transition-colors">✕ Reset</button>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Aksi', 'VM', 'Actor', 'Waktu'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedAuditLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-background/50">
                  <td className="px-4 py-3">
                    <AuditActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted">
                    {log.metadata?.displayId ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {log.actorType === 'system'
                      ? <span className="font-medium text-muted">System</span>
                      : <span className="font-medium">{user.fullName ?? user.email}</span>
                    }
                    <span className="text-muted ml-1 text-[10px]">({log.actorType})</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAuditLogs.length === 0 && <p className="text-center py-8 text-muted text-sm">Tidak ada log.</p>}
          <Pagination total={filteredAuditLogs.length} page={auditPage} pageSize={auditPageSize} onPage={setAuditPage} onPageSize={setAuditPageSize} />
        </div>
      )}
    </div>
  )
}
