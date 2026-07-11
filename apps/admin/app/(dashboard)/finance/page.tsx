'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { TrendingUp, DollarSign, CreditCard, Server, Cpu, MemoryStick, HardDrive, Users, Plus } from 'lucide-react'

function StatCard({ label, value, sub, icon: Icon, accent = false }: {
  label: string; value: string; sub?: string; icon: any; accent?: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-xl shrink-0 ${accent ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-xl font-bold mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function AdminFinancePage() {
  const [revenue, setRevenue] = useState<any>(null)
  const [costs, setCosts] = useState<any[]>([])
  const [capacity, setCapacity] = useState<any>(null)
  const [topSpenders, setTopSpenders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [newCost, setNewCost] = useState({ month: '', category: '', amount: '', notes: '' })
  const [costMsg, setCostMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/admin/finance/revenue').catch(() => ({ data: null })),
      api.get('/admin/finance/costs').catch(() => ({ data: [] })),
      api.get('/admin/finance/capacity').catch(() => ({ data: null })),
      api.get('/admin/finance/top-spenders').catch(() => ({ data: [] })),
    ]).then(([r, c, cap, ts]) => {
      setRevenue(r.data)
      setCosts(c.data)
      setCapacity(cap.data)
      setTopSpenders(ts.data)
    }).finally(() => setLoading(false))
  }, [])

  async function addCost() {
    try {
      await api.post('/admin/finance/costs', {
        label: newCost.category,
        periodMonth: newCost.month,
        amount: Number(newCost.amount),
        notes: newCost.notes || undefined,
      })
      setCostMsg({ text: 'Biaya berhasil ditambahkan', ok: true })
      setNewCost({ month: '', category: '', amount: '', notes: '' })
      const { data } = await api.get('/admin/finance/costs')
      setCosts(data)
    } catch (e: any) {
      setCostMsg({ text: e.response?.data?.message ?? 'Gagal menambahkan biaya', ok: false })
    }
  }

  if (loading) return <div className="text-sm text-muted">Memuat data keuangan...</div>

  const cur = revenue?.currentMonth ?? revenue ?? {}

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold">Financial Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Revenue Bulan Ini" value={formatRupiah(Number(cur.revenue ?? 0))} accent />
        <StatCard icon={DollarSign} label="Profit Estimasi" value={formatRupiah(Number(cur.profit ?? 0))} sub="Setelah COGS & biaya PG" />
        <StatCard icon={CreditCard} label="Total Topup" value={formatRupiah(Number(cur.totalTopup ?? revenue?.topupVolume ?? 0))} />
        <StatCard icon={Server} label="Total VM Aktif" value={String(revenue?.activeVms ?? 0)} sub={`${revenue?.activeUsers ?? 0} user aktif`} />
      </div>

      {/* Capacity + Top Spenders */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Capacity */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-muted" />
            <h2 className="font-semibold text-sm">Kapasitas Cluster</h2>
            {capacity?.error && <span className="text-xs text-amber-500 ml-auto">{capacity.error}</span>}
          </div>
          <div className="space-y-4">
            {[
              { label: 'CPU', icon: Cpu, value: capacity?.usedCpu ?? 0, max: capacity?.totalCpu ?? 0, unit: 'core' },
              { label: 'RAM', icon: MemoryStick, value: capacity?.usedRam ?? 0, max: capacity?.totalRam ?? 0, unit: 'GB' },
              { label: 'Storage', icon: HardDrive, value: capacity?.usedDisk ?? 0, max: capacity?.totalDisk ?? 0, unit: 'GB' },
            ].map(({ label, icon: Icon, value, max, unit }) => {
              const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
              const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-green-500'
              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted"><Icon size={12} /> {label}</span>
                    <span className="font-medium">{value} / {max} {unit} <span className="text-muted">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Spenders */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-muted" />
            <h2 className="font-semibold text-sm">Top Spenders</h2>
            <span className="text-xs text-muted ml-auto">bulan ini</span>
          </div>
          <div className="space-y-2.5">
            {topSpenders.slice(0, 8).map((u: any, i) => (
              <div key={u.userId ?? i} className="flex items-center gap-3">
                <span className="text-xs text-muted w-5 text-right shrink-0">{i + 1}</span>
                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-accent">
                    {(u.fullName || u.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.fullName || '—'}</p>
                  <p className="text-xs text-muted truncate">{u.email}</p>
                </div>
                <p className="text-sm font-semibold text-accent shrink-0">{formatRupiah(Number(u.totalSpent ?? 0))}</p>
              </div>
            ))}
            {topSpenders.length === 0 && <p className="text-muted text-sm">Belum ada data bulan ini.</p>}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      {revenue?.monthly?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Tren Bulanan</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border">
                  {['Bulan', 'Revenue', 'COGS', 'Biaya PG', 'Profit'].map(h => (
                    <th key={h} className="pb-2 pr-8 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {revenue.monthly.map((m: any) => (
                  <tr key={m.month} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-8 text-muted font-mono text-xs">{m.month}</td>
                    <td className="py-2.5 pr-8 font-semibold">{formatRupiah(m.revenue)}</td>
                    <td className="py-2.5 pr-8 text-muted">{formatRupiah(m.cogs)}</td>
                    <td className="py-2.5 pr-8 text-muted">{formatRupiah(m.pgFee)}</td>
                    <td className={`py-2.5 font-semibold ${m.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatRupiah(m.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Server costs */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Biaya Operasional</h2>

        {costMsg && (
          <div className={`p-3 rounded-lg text-sm border ${costMsg.ok
            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}>
            {costMsg.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted">Bulan</p>
            <input value={newCost.month} onChange={e => setNewCost(c => ({ ...c, month: e.target.value }))}
              type="month"
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent w-40"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-36">
            <p className="text-xs text-muted">Kategori</p>
            <input value={newCost.category} onChange={e => setNewCost(c => ({ ...c, category: e.target.value }))}
              placeholder="server, bandwidth..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1 w-40">
            <p className="text-xs text-muted">Jumlah (Rp)</p>
            <input value={newCost.amount} onChange={e => setNewCost(c => ({ ...c, amount: e.target.value }))}
              placeholder="0" type="number"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-36">
            <p className="text-xs text-muted">Catatan</p>
            <input value={newCost.notes} onChange={e => setNewCost(c => ({ ...c, notes: e.target.value }))}
              placeholder="Opsional"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
            />
          </div>
          <button onClick={addCost}
            disabled={!newCost.month || !newCost.category || !newCost.amount}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                {['Bulan', 'Kategori', 'Jumlah', 'Catatan', 'Ditambahkan'].map(h => (
                  <th key={h} className="pb-2 pr-6 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {costs.map((c: any) => (
                <tr key={c.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <td className="py-2.5 pr-6 font-mono text-xs">{c.periodMonth ? new Date(c.periodMonth).toISOString().slice(0, 7) : '—'}</td>
                  <td className="py-2.5 pr-6 capitalize">{c.label}</td>
                  <td className="py-2.5 pr-6 font-semibold">{formatRupiah(c.amount)}</td>
                  <td className="py-2.5 pr-6 text-muted text-xs">{c.notes ?? '—'}</td>
                  <td className="py-2.5 text-muted text-xs">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {costs.length === 0 && (
            <p className="text-muted text-sm mt-6 text-center py-4">Belum ada biaya dicatat.</p>
          )}
        </div>
      </div>
    </div>
  )
}
