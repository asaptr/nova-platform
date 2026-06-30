'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { ArrowLeft, Play, Square, RotateCcw, PauseCircle, PlayCircle, Monitor, Key } from 'lucide-react'

const statusColor: Record<string, string> = {
  running: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  stopped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspended: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  provisioning: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export default function AdminVmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [vm, setVm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [consoleTicket, setConsoleTicket] = useState<{ url: string; ticket: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data } = await api.get(`/admin/vms/${id}`)
    setVm(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function action(type: string, body?: any) {
    setActionLoading(type); setMsg(null)
    try {
      await api.post(`/admin/vms/${id}/${type}`, body ?? {})
      setMsg(`Berhasil: ${type}`)
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message ?? `Gagal: ${type}`)
    } finally { setActionLoading(null) }
  }

  async function openConsole() {
    setActionLoading('console')
    try {
      const { data } = await api.post(`/admin/vms/${id}/console`)
      setConsoleTicket(data)
    } catch { setMsg('Gagal membuka konsol') }
    finally { setActionLoading(null) }
  }

  if (loading) return <div className="text-muted text-sm">Memuat...</div>
  if (!vm) return <div className="text-red-500 text-sm">VM tidak ditemukan.</div>

  const btnBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/vms" className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{vm.hostname}</h1>
          <p className="text-sm text-muted">{vm.displayId}</p>
        </div>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded font-medium ${statusColor[vm.status] ?? ''}`}>{vm.status}</span>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${msg.startsWith('Berhasil') ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}>
          {msg}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 bg-card border border-border rounded-xl p-4">
        <button onClick={() => action('start')} disabled={!!actionLoading || vm.status === 'running'}
          className={`${btnBase} bg-green-500 text-white hover:bg-green-600`}>
          <Play size={14} /> Start
        </button>
        <button onClick={() => action('stop', { force: false })} disabled={!!actionLoading || vm.status === 'stopped'}
          className={`${btnBase} bg-red-500 text-white hover:bg-red-600`}>
          <Square size={14} /> Stop
        </button>
        <button onClick={() => action('stop', { force: true })} disabled={!!actionLoading}
          className={`${btnBase} bg-red-700 text-white hover:bg-red-800`}>
          <Square size={14} /> Force Stop
        </button>
        <button onClick={() => action('reboot')} disabled={!!actionLoading || vm.status !== 'running'}
          className={`${btnBase} bg-blue-500 text-white hover:bg-blue-600`}>
          <RotateCcw size={14} /> Reboot
        </button>
        {vm.status !== 'suspended' ? (
          <button onClick={() => action('suspend')} disabled={!!actionLoading}
            className={`${btnBase} bg-amber-500 text-white hover:bg-amber-600`}>
            <PauseCircle size={14} /> Suspend
          </button>
        ) : (
          <button onClick={() => action('unsuspend')} disabled={!!actionLoading}
            className={`${btnBase} bg-accent text-white hover:opacity-90`}>
            <PlayCircle size={14} /> Unsuspend
          </button>
        )}
        <button onClick={openConsole} disabled={!!actionLoading}
          className={`${btnBase} bg-gray-700 text-white hover:bg-gray-800`}>
          <Monitor size={14} /> Konsol
        </button>
      </div>

      {/* noVNC console */}
      {consoleTicket && (
        <div className="bg-black rounded-xl overflow-hidden border border-border">
          <iframe
            src={`/novnc/vnc.html?autoconnect=1&host=${consoleTicket.url}&password=${consoleTicket.ticket}`}
            className="w-full h-96"
            title="VNC Console"
          />
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Detail VM</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['VMID', vm.proxmoxVmid],
              ['Node', vm.proxmoxNode],
              ['Paket', vm.package?.name],
              ['OS', vm.osTemplate],
              ['IP', vm.ipAddress],
              ['Tipe', vm.ipType],
              ['Dibuat', formatDate(vm.createdAt)],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-mono text-right">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Pemilik</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Nama', vm.user?.fullName],
              ['Email', vm.user?.email],
              ['Saldo', vm.user ? formatRupiah(vm.user.balance) : '—'],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd>{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {vm.user && (
            <Link href={`/users/${vm.user.id}`} className="text-xs text-accent hover:underline">
              Lihat profil user →
            </Link>
          )}
        </div>
      </div>

      {/* Live status from Proxmox */}
      {vm.liveStatus && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Status Live (Proxmox)</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted mb-1">CPU</p>
              <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((vm.liveStatus.cpu ?? 0) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted mt-1">{Math.round((vm.liveStatus.cpu ?? 0) * 100)}%</p>
            </div>
            <div>
              <p className="text-muted mb-1">RAM</p>
              <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full">
                <div className="h-full bg-purple-500 rounded-full"
                  style={{ width: `${Math.round(((vm.liveStatus.mem ?? 0) / (vm.liveStatus.maxmem ?? 1)) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted mt-1">
                {Math.round((vm.liveStatus.mem ?? 0) / 1024 / 1024)} / {Math.round((vm.liveStatus.maxmem ?? 0) / 1024 / 1024)} MB
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NAT ports */}
      {vm.natPortForwards?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="font-semibold text-sm mb-3">Port Forward NAT</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted">
              <th className="pb-2">Protokol</th><th className="pb-2">Port Luar</th><th className="pb-2">Port Dalam</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {vm.natPortForwards.map((p: any) => (
                <tr key={p.id}>
                  <td className="py-2">{p.protocol}</td>
                  <td className="py-2 font-mono">{p.externalPort}</td>
                  <td className="py-2 font-mono">{p.internalPort}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset password */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="font-semibold text-sm mb-3">Reset Password Root</h2>
        <div className="flex gap-2">
          <input value={newPw} onChange={e => setNewPw(e.target.value)}
            placeholder="Password baru"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
          <button onClick={() => { action('reset-password', { newPassword: newPw }); setNewPw('') }}
            disabled={!!actionLoading || !newPw}
            className={`${btnBase} bg-accent text-white hover:opacity-90`}>
            <Key size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  )
}
