'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { formatRupiah } from '@/lib/utils'
import type { Package } from '@langitnode/types'
import { RefreshCw } from 'lucide-react'

const OS_TEMPLATES = [
  { label: 'Ubuntu 22.04 LTS', value: 'ubuntu-22.04' },
  { label: 'Ubuntu 20.04 LTS', value: 'ubuntu-20.04' },
  { label: 'Debian 12', value: 'debian-12' },
  { label: 'Debian 11', value: 'debian-11' },
  { label: 'AlmaLinux 9', value: 'almalinux-9' },
]

function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function NewVmPage() {
  const router = useRouter()
  const [packages, setPackages] = useState<Package[]>([])
  const [form, setForm] = useState({
    packageId: '',
    osTemplate: 'ubuntu-22.04',
    hostname: '',
    rootPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ipFilter, setIpFilter] = useState<'all' | 'nat' | 'public'>('all')

  useEffect(() => {
    api.get('/vms/packages').then(r => {
      setPackages(r.data)
      if (r.data.length > 0) setForm(f => ({ ...f, packageId: r.data[0].id }))
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
        <div className="space-y-1.5">
          <label className="text-sm font-medium">OS Template</label>
          <select
            value={form.osTemplate}
            onChange={e => setForm(f => ({ ...f, osTemplate: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          >
            {OS_TEMPLATES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Hostname */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Hostname <span className="text-muted font-normal">(opsional)</span></label>
          <input
            type="text"
            value={form.hostname}
            onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
            placeholder="my-server (default: ln-nat-0001)"
          />
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
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">Konfirmasi</p>
            <p className="text-amber-700 dark:text-amber-400 mt-1">
              Saldo akan dipotong <strong>{formatRupiah(Number(selectedPkg.priceHourly) * 24)}</strong> (deposit 1 hari) saat deploy.
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
