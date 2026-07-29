'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { formatRupiah } from '@/lib/utils'
import type { Package } from '@nova/types'
import { RefreshCw } from 'lucide-react'

type OsTemplate = { id: string; name: string; description: string | null; badge: string | null; osFamily: string; proxmoxValue: string }

function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function NewVmPage() {
  const router = useRouter()
  const [packages, setPackages] = useState<Package[]>([])
  const [templates, setTemplates] = useState<OsTemplate[]>([])
  const [form, setForm] = useState({
    packageId: '',
    osTemplate: '',
    rootPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ipFilter, setIpFilter] = useState<'all' | 'nat' | 'public'>('all')

  useEffect(() => {
    Promise.all([api.get('/vms/packages'), api.get('/vms/templates')]).then(([pkgs, tmpl]) => {
      setPackages(pkgs.data)
      setTemplates(tmpl.data)
      if (pkgs.data.length > 0) setForm(f => ({ ...f, packageId: pkgs.data[0].id }))
      if (tmpl.data.length > 0) setForm(f => ({ ...f, osTemplate: tmpl.data[0].proxmoxValue }))
    })
  }, [])

  const selectedPkg = packages.find(p => p.id === form.packageId)
  const filteredPkgs = packages.filter(p => ipFilter === 'all' || p.ipType === ipFilter)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rootPassword) { setError('Password root wajib diisi'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/vms', form)
      router.push(`/vms/${data.vmId}`)
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Gagal membuat VM')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Buat VM Baru</h1>
        <p className="text-sm text-muted mt-1">Isi form berikut untuk deploy VPS baru.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Filter NAT / Public */}
        <div className="flex gap-2">
          {(['all', 'nat', 'public'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setIpFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                ipFilter === f ? 'bg-accent text-white' : 'border border-border text-muted hover:border-accent/50'
              }`}
            >
              {f === 'all' ? 'Semua' : f === 'nat' ? 'NAT' : 'IP Public'}
            </button>
          ))}
        </div>

        {/* Pilih paket */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="font-medium text-sm">Pilih Paket</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {filteredPkgs.map(pkg => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => setForm(f => ({ ...f, packageId: pkg.id }))}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  form.packageId === pkg.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{pkg.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {pkg.vcpu} vCPU · {pkg.ramMb >= 1024 ? `${pkg.ramMb/1024} GB` : `${pkg.ramMb} MB`} RAM · {pkg.diskGb} GB SSD
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold">{formatRupiah(pkg.priceMonthly)}</p>
                    <p className="text-xs text-muted">/bln</p>
                  </div>
                </div>
                <span className={`mt-2 inline-block text-xs px-1.5 py-0.5 rounded font-medium ${
                  pkg.ipType === 'nat' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                }`}>
                  {pkg.ipType === 'nat' ? 'NAT' : 'IP Public'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* OS Template */}
        <div className="space-y-2">
          <label className="text-sm font-medium">OS Template</label>
          {templates.length === 0 ? (
            <p className="text-sm text-muted border border-border rounded-lg px-3 py-2">
              Belum ada template tersedia. Hubungi admin.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, osTemplate: t.proxmoxValue }))}
                  className={`p-3 rounded-lg border text-left transition-colors relative ${
                    form.osTemplate === t.proxmoxValue ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'
                  }`}
                >
                  {t.badge && (
                    <span className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded-full font-medium bg-accent text-white">
                      {t.badge}
                    </span>
                  )}
                  <p className="font-medium text-sm">{t.name}</p>
                  {t.description && <p className="text-xs text-muted mt-0.5">{t.description}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Password root */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Password Root <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.rootPassword}
              onChange={e => setForm(f => ({ ...f, rootPassword: e.target.value }))}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent font-mono"
              placeholder="Min. 8 karakter, huruf + angka"
              required
            />
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, rootPassword: generatePassword() }))}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-primary hover:border-accent/50 transition-colors"
            >
              <RefreshCw size={14} /> Generate
            </button>
          </div>
          <p className="text-xs text-muted">Simpan password ini! Tidak akan ditampilkan lagi setelah VM dibuat.</p>
        </div>

        {selectedPkg && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-300">Billing Per Jam</p>
            <p className="text-blue-700 dark:text-blue-400 mt-1">
              Tagihan <strong>{formatRupiah(Number(selectedPkg.priceHourly))}/jam</strong> — saldo dipotong setiap jam selama VM aktif. Tidak ada deposit di muka.
            </p>
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !form.packageId}
          className="w-full bg-accent text-white font-medium py-3 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Deploy VM Sekarang'}
        </button>
      </form>
    </div>
  )
}
