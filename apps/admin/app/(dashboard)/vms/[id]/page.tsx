'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah, formatOsName } from '@/lib/utils'
import { ArrowLeft, Play, Square, RotateCcw, PauseCircle, PlayCircle, Monitor, Key, RefreshCw, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { VmConsole } from '@/components/vm/vm-console'

const statusColor: Record<string, string> = {
  running:      'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  stopped:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspended:    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  paused:       'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  provisioning: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  failed:       'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const proxmoxToDisplay: Record<string, string> = {
  running: 'running', stopped: 'stopped', paused: 'suspended',
}

export default function AdminVmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [vm, setVm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/vms/${id}`)
      setVm(data)
    } finally {
      setLoading(false)
    }
  }, [id])

  // Auto-poll every 5s
  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  async function action(type: string, body?: any) {
    setActionLoading(type); setMsg(null)
    try {
      await api.post(`/admin/vms/${id}/${type}`, body ?? {})
      setMsg({ text: `Berhasil: ${type}`, ok: true })
      await load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message ?? `Gagal: ${type}`, ok: false })
    } finally { setActionLoading(null) }
  }

  async function deleteVm() {
    if (!confirm(`Hapus VM ${vm.hostname} (${vm.displayId}) permanen dari Proxmox? Tindakan ini tidak dapat dibatalkan.`)) return
    setDeleting(true); setMsg(null)
    try {
      await api.delete(`/admin/vms/${id}`)
      setMsg({ text: 'VM berhasil dihapus', ok: true })
      setTimeout(() => { window.location.href = '/vms' }, 1500)
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message ?? 'Gagal menghapus VM', ok: false })
    } finally { setDeleting(false) }
  }

  async function syncStatus() {
    setSyncing(true); setMsg(null)
    try {
      const { data } = await api.post(`/admin/vms/${id}/sync-status`)
      setMsg({ text: `Status disinkronkan: ${data.status}`, ok: true })
      await load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message ?? 'Gagal sync', ok: false })
    } finally { setSyncing(false) }
  }

  if (loading) return <div className="text-muted text-sm">Memuat...</div>
  if (!vm) return <div className="text-red-500 text-sm">VM tidak ditemukan.</div>

  // Prefer live Proxmox status over DB status
  const liveStatus = vm.proxmoxStatus?.status ? (proxmoxToDisplay[vm.proxmoxStatus.status] ?? vm.proxmoxStatus.status) : vm.status
  const isRunning = liveStatus === 'running'
  const isStopped = liveStatus === 'stopped'
  const isSuspended = liveStatus === 'suspended'
  const dbMatchesLive = vm.status === liveStatus

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
        <div className="ml-auto flex items-center gap-2">
          {/* Live status from Proxmox */}
          <span className={`text-xs px-2.5 py-1 rounded font-medium ${statusColor[liveStatus] ?? ''}`}>
            {liveStatus}
          </span>
          {/* DB out of sync indicator */}
          {!dbMatchesLive && (
            <span className="text-xs text-amber-600 dark:text-amber-400">DB: {vm.status}</span>
          )}
          <button
            onClick={syncStatus}
            disabled={syncing || dbMatchesLive}
            title="Sinkronkan status DB dengan Proxmox"
            className="p-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-accent/50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${msg.ok
          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
          : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}>
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 bg-card border border-border rounded-xl p-4">
        <button onClick={() => action('start')}
          disabled={!!actionLoading || isRunning}
          className={`${btnBase} bg-green-500 text-white hover:bg-green-600`}>
          <Play size={14} /> Start
        </button>
        <button onClick={() => action('stop', { force: false })}
          disabled={!!actionLoading || isStopped || isSuspended}
          className={`${btnBase} bg-red-500 text-white hover:bg-red-600`}>
          <Square size={14} /> Stop
        </button>
        <button onClick={() => action('stop', { force: true })}
          disabled={!!actionLoading || isStopped}
          className={`${btnBase} bg-red-700 text-white hover:bg-red-800`}>
          <Square size={14} /> Force Stop
        </button>
        <button onClick={() => action('reboot')}
          disabled={!!actionLoading || !isRunning}
          className={`${btnBase} bg-blue-500 text-white hover:bg-blue-600`}>
          <RotateCcw size={14} /> Reboot
        </button>
        {!isSuspended ? (
          <button onClick={() => action('suspend')}
            disabled={!!actionLoading || !isRunning}
            className={`${btnBase} bg-amber-500 text-white hover:bg-amber-600`}>
            <PauseCircle size={14} /> Suspend
          </button>
        ) : (
          <button onClick={() => action('unsuspend')}
            disabled={!!actionLoading}
            className={`${btnBase} bg-accent text-white hover:opacity-90`}>
            <PlayCircle size={14} /> Unsuspend
          </button>
        )}
        <button
          onClick={() => setShowConsole(v => !v)}
          disabled={isStopped}
          className={`${btnBase} bg-gray-700 text-white hover:bg-gray-800`}>
          <Monitor size={14} /> Konsol {showConsole ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <div className="ml-auto">
          <button
            onClick={deleteVm}
            disabled={deleting || !!actionLoading}
            className={`${btnBase} bg-red-600 text-white hover:bg-red-700`}>
            <Trash2 size={14} /> {deleting ? 'Menghapus...' : 'Hapus VM'}
          </button>
        </div>
      </div>

      {showConsole && !isStopped && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Monitor size={14} /> Console</h2>
          <VmConsole vmId={id} />
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
              ['OS', vm.templateName ?? formatOsName(vm.osTemplate)],
              ['IP', vm.ipAddress],
              ['SSH Port', vm.sshPort],
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

      {/* Live resource usage */}
      {vm.proxmoxStatus && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Resource Live (Proxmox)</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted mb-1">CPU — {Math.round((vm.proxmoxStatus.cpu ?? 0) * 100)}%</p>
              <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.round((vm.proxmoxStatus.cpu ?? 0) * 100)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-muted mb-1">
                RAM — {Math.round((vm.proxmoxStatus.mem ?? 0) / 1024 / 1024)} / {Math.round((vm.proxmoxStatus.maxmem ?? 0) / 1024 / 1024)} MB
              </p>
              <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full">
                <div className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.round(((vm.proxmoxStatus.mem ?? 0) / (vm.proxmoxStatus.maxmem ?? 1)) * 100)}%` }} />
              </div>
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
              <th className="pb-2">Port Luar</th><th className="pb-2">Port Dalam</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {vm.natPortForwards.map((p: any) => (
                <tr key={p.id}>
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
            placeholder="Password baru (min 8 karakter)"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
          />
          <button onClick={() => { action('reset-password', { password: newPw }); setNewPw('') }}
            disabled={!!actionLoading || newPw.length < 8}
            className={`${btnBase} bg-accent text-white hover:opacity-90`}>
            <Key size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  )
}
