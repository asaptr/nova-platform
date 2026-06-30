'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
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
  const [costMsg, setCostMsg] = useState<string | null>(null)

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
        ...newCost,
        amount: Number(newCost.amount),
      })
      setCostMsg('Biaya berhasil ditambahkan')
      setNewCost({ month: '', category: '', amount: '', notes: '' })
      const { data } = await api.get('/admin/finance/costs')
      setCosts(data)
    } catch (e: any) {
      setCostMsg(e.response?.data?.message ?? 'Gagal menambahkan biaya')
    }
  }

  if (loading) return <div className="text-sm text-muted">Memuat data keuangan...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financial Overview</h1>

      {revenue && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue Bulan Ini" value={formatRupiah(revenue.currentMonth?.revenue ?? 0)} />
            <StatCard label="Profit Estimasi" value={formatRupiah(revenue.currentMonth?.profit ?? 0)}
              sub={`Setelah COGS & biaya PG`} />
            <StatCard label="Total Topup" value={formatRupiah(revenue.currentMonth?.totalTopup ?? 0)} />
            <StatCard label="Total VM Aktif" value={String(revenue.activeVms ?? 0)} />
          </div>

          {/* Monthly trend */}
          {revenue.monthly && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold mb-4">Tren Bulanan</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-border">
                      {['Bulan', 'Revenue', 'COGS', 'Biaya PG', 'Profit'].map(h => (
                        <th key={h} className="pb-2 pr-6">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {revenue.monthly.map((m: any) => (
                      <tr key={m.month}>
                        <td className="py-2 pr-6 text-muted">{m.month}</td>
                        <td className="py-2 pr-6 font-medium">{formatRupiah(m.revenue)}</td>
                        <td className="py-2 pr-6">{formatRupiah(m.cogs)}</td>
                        <td className="py-2 pr-6">{formatRupiah(m.pgFee)}</td>
                        <td className={`py-2 font-medium ${m.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatRupiah(m.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Capacity */}
        {capacity && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold">Kapasitas Cluster</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'CPU Terpakai', value: capacity.usedCpu, max: capacity.totalCpu, unit: 'core' },
                { label: 'RAM Terpakai', value: capacity.usedRam, max: capacity.totalRam, unit: 'GB' },
                { label: 'Storage Terpakai', value: capacity.usedDisk, max: capacity.totalDisk, unit: 'GB' },
              ].map(({ label, value, max, unit }) => {
                const pct = max > 0 ? Math.round((value / max) * 100) : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span>{value}/{max} {unit} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full">
                      <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top spenders */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold">Top Spenders</h2>
          <div className="space-y-2">
            {topSpenders.slice(0, 8).map((u: any, i) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted w-5 text-right">{i + 1}.</span>
                  <div>
                    <p className="font-medium">{u.fullName}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </div>
                </div>
                <p className="font-medium">{formatRupiah(u.totalSpent)}</p>
              </div>
            ))}
            {topSpenders.length === 0 && <p className="text-muted text-sm">Belum ada data.</p>}
          </div>
        </div>
      </div>

      {/* Server costs */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Biaya Operasional</h2>

        {costMsg && (
          <p className="text-sm text-blue-600 dark:text-blue-400">{costMsg}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={newCost.month} onChange={e => setNewCost(c => ({ ...c, month: e.target.value }))}
            placeholder="Bulan (YYYY-MM)" type="month"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
          <input value={newCost.category} onChange={e => setNewCost(c => ({ ...c, category: e.target.value }))}
            placeholder="Kategori (server, bandwidth...)"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
          <input value={newCost.amount} onChange={e => setNewCost(c => ({ ...c, amount: e.target.value }))}
            placeholder="Jumlah (Rp)" type="number"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
          <input value={newCost.notes} onChange={e => setNewCost(c => ({ ...c, notes: e.target.value }))}
            placeholder="Catatan"
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
        </div>
        <button onClick={addCost} disabled={!newCost.month || !newCost.category || !newCost.amount}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
        >
          Tambah Biaya
        </button>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                {['Bulan', 'Kategori', 'Jumlah', 'Catatan', 'Ditambahkan'].map(h => (
                  <th key={h} className="pb-2 pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {costs.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-2 pr-6 font-mono text-xs">{c.month}</td>
                  <td className="py-2 pr-6 capitalize">{c.category}</td>
                  <td className="py-2 pr-6 font-medium">{formatRupiah(c.amount)}</td>
                  <td className="py-2 pr-6 text-muted text-xs">{c.notes ?? '—'}</td>
                  <td className="py-2 text-muted text-xs">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {costs.length === 0 && <p className="text-muted text-sm mt-4">Belum ada biaya dicatat.</p>}
        </div>
      </div>
    </div>
  )
}
