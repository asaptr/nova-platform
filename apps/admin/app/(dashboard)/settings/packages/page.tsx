'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatRupiah } from '@/lib/utils'
import { Plus, Trash2, Pencil, X, Check, Server } from 'lucide-react'

const emptyForm = {
  name: '', vcpu: '', ramMb: '', diskGb: '', bandwidthGb: '0',
  priceMonthly: '', ipType: 'nat', isActive: true,
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data } = await api.get('/admin/packages')
    setPackages(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(pkg: any) {
    setForm({
      name: pkg.name,
      vcpu: String(pkg.vcpu),
      ramMb: String(pkg.ramMb),
      diskGb: String(pkg.diskGb),
      bandwidthGb: String(pkg.bandwidthGb ?? 0),
      priceMonthly: String(pkg.priceMonthly),
      ipType: pkg.ipType,
      isActive: pkg.isActive,
    })
    setEditId(pkg.id)
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false); setEditId(null); setForm({ ...emptyForm }); setMsg(null)
  }

  const priceHourly = form.priceMonthly ? Math.ceil(Number(form.priceMonthly) / 720) : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      name: form.name,
      vcpu: Number(form.vcpu),
      ramMb: Number(form.ramMb),
      diskGb: Number(form.diskGb),
      bandwidthGb: Number(form.bandwidthGb),
      priceMonthly: Number(form.priceMonthly),
      priceHourly,
      ipType: form.ipType,
      isActive: form.isActive,
    }
    try {
      if (editId) {
        await api.patch(`/admin/packages/${editId}`, body)
        setMsg('Paket berhasil diperbarui')
      } else {
        await api.post('/admin/packages', body)
        setMsg('Paket berhasil ditambahkan')
      }
      cancel()
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message ?? 'Gagal menyimpan paket')
    }
  }

  async function deletePackage(id: string) {
    if (!confirm('Hapus paket ini?')) return
    await api.delete(`/admin/packages/${id}`)
    load()
  }

  const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Paket</h1>
        <div className="flex items-center gap-2">
          <Link href="/settings/templates" className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-primary transition-colors">
            <Server size={14} /> OS Templates
          </Link>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ ...emptyForm }) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
          >
            <Plus size={14} /> Tambah Paket
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-blue-600 dark:text-blue-400">{msg}</p>}

      {showForm && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">{editId ? 'Edit Paket' : 'Paket Baru'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Nama Paket</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Starter NAT 1" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">vCPU (core)</label>
              <input required type="number" min="1" value={form.vcpu} onChange={e => setForm(f => ({ ...f, vcpu: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">RAM (MB)</label>
              <input required type="number" min="512" value={form.ramMb} onChange={e => setForm(f => ({ ...f, ramMb: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Disk (GB)</label>
              <input required type="number" min="5" value={form.diskGb} onChange={e => setForm(f => ({ ...f, diskGb: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Bandwidth (GB, 0 = unlimited)</label>
              <input required type="number" min="0" value={form.bandwidthGb} onChange={e => setForm(f => ({ ...f, bandwidthGb: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Harga/Bulan (Rp)</label>
              <input required type="number" min="1" value={form.priceMonthly} onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Harga/Jam (auto)</label>
              <div className={`${inputCls} bg-muted/5 text-muted cursor-default select-none`}>
                {priceHourly > 0 ? formatRupiah(priceHourly) : '—'}
                <span className="text-xs ml-1 opacity-60">= bulanan ÷ 720</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Tipe IP</label>
              <select value={form.ipType} onChange={e => setForm(f => ({ ...f, ipType: e.target.value }))}
                className={inputCls}>
                <option value="nat">NAT</option>
                <option value="public">Public IP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Status</label>
              <select value={String(form.isActive)} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'true' }))}
                className={inputCls}>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancel}
              className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm hover:bg-background transition-colors">
              <X size={14} /> Batal
            </button>
            <button type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors">
              <Check size={14} /> {editId ? 'Perbarui' : 'Simpan'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-36 animate-pulse" />
          ))
        ) : packages.map(pkg => (
          <div key={pkg.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{pkg.name}</p>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(pkg)}
                  className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => deletePackage(pkg.id)}
                  className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="bg-background rounded-lg p-2">
                <p className="text-xs text-muted">CPU</p>
                <p className="font-bold">{pkg.vcpu}c</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-xs text-muted">RAM</p>
                <p className="font-bold">{pkg.ramMb >= 1024 ? `${pkg.ramMb / 1024}GB` : `${pkg.ramMb}MB`}</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-xs text-muted">Disk</p>
                <p className="font-bold">{pkg.diskGb}GB</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                pkg.ipType === 'nat' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
              }`}>{pkg.ipType.toUpperCase()}</span>
              <p className="font-semibold text-accent">{formatRupiah(Number(pkg.priceHourly))}<span className="text-xs text-muted font-normal">/jam</span></p>
            </div>
            {!pkg.isActive && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Nonaktif — tidak tampil di portal</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
