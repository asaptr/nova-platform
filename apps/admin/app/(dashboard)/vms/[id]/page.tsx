'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate, formatRupiah, formatOsName } from '@/lib/utils'
import { ArrowLeft, Play, Square, RotateCcw, PauseCircle, PlayCircle, Monitor, Key, RefreshCw, ChevronDown, ChevronUp, Trash2, Terminal, X } from 'lucide-react'
import { VmConsole } from '@/components/vm/vm-console'
import { useToast } from '@/components/ui/toast'

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
  const [syncing, setSyncing] = useState(false)
  const { toast } = useToast()
  const [showConsole, setShowConsole] = useState(false)
  const [consoleTab, setConsoleTab] = useState<'vnc' | 'terminal'>('vnc')
  const [sessionKey, setSessionKey] = useState(0)
  const [consoleDropdown, setConsoleDropdown] = useState(false)
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

  const ACTION_SUCCESS: Record<string, string> = {
    start:          'VM berhasil dinyalakan',
    stop:           'VM berhasil dimatikan',
    reboot:         'VM berhasil di-reboot',
    suspend:        'VM berhasil di-suspend',
    unsuspend:      'VM berhasil diaktifkan kembali',
    'reset-password': 'Password root berhasil di-reset',
    'enable-serial':    'Serial console diaktifkan. Reboot VM agar terminal (xterm) tersedia.',
    'fix-vga':          'VGA berhasil diperbaiki. Reboot VM agar perubahan berlaku.',
    'enable-autostart': 'Autostart diaktifkan. VM akan menyala otomatis saat node hidup.',
  }

  async function action(type: string, body?: any) {
    setActionLoading(type)
    try {
      const { data } = await api.post(`/admin/vms/${id}/${type}`, body ?? {})
      toast(data?.message ?? ACTION_SUCCESS[type] ?? `Berhasil: ${type}`, 'success')
      await load()
    } catch (e: any) {
      toast(e.response?.data?.message ?? `Gagal: ${type}`, 'error')
    } finally { setActionLoading(null) }
  }

  async function deleteVm() {
    if (!confirm(`Hapus VM ${vm.hostname} (${vm.displayId}) permanen dari Proxmox? Tindakan ini tidak dapat dibatalkan.`)) return
    setDeleting(true)
    try {
      await api.delete(`/admin/vms/${id}`)
      toast('VM berhasil dihapus', 'success')
      setTimeout(() => { window.location.href = '/vms' }, 1500)
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Gagal menghapus VM', 'error')
    } finally { setDeleting(false) }
  }

  async function syncStatus() {
    setSyncing(true)
    try {
      const { data } = await api.post(`/admin/vms/${id}/sync-status`)
      toast(`Status disinkronkan: ${data.status}`, 'success')
      await load()
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Gagal sync', 'error')
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
        {/* Console split-button dropdown */}
        <div className="relative">
          <div className="flex rounded-lg overflow-hidden">
            <button
              onClick={() => { setShowConsole(true); setConsoleDropdown(false) }}
              disabled={isStopped || !!actionLoading}
              className={`${btnBase} rounded-none bg-gray-700 text-white hover:bg-gray-800`}>
              <Monitor size={14} /> Konsol
            </button>
            <button
              onClick={() => setConsoleDropdown(v => !v)}
              disabled={isStopped || !!actionLoading}
              className="px-2 py-1.5 bg-gray-700 text-white hover:bg-gray-600 border-l border-gray-600 rounded-r-lg disabled:opacity-50 transition-colors">
              <ChevronDown size={12} />
            </button>
          </div>
          {consoleDropdown && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-xl shadow-lg z-20 overflow-hidden">
              <button onClick={() => { setConsoleTab('vnc'); setSessionKey(k => k + 1); setShowConsole(true); setConsoleDropdown(false) }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <Monitor size={13} className="text-muted" /> VGA (noVNC)
              </button>
              <button onClick={() => { setConsoleTab('terminal'); setSessionKey(k => k + 1); setShowConsole(true); setConsoleDropdown(false) }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <Terminal size={13} className="text-muted" /> Terminal (xterm)
              </button>
            </div>
          )}
        </div>
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
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              {consoleTab === 'vnc'
                ? <><Monitor size={14} className="text-muted" /><span className="text-sm font-medium">VGA (noVNC)</span></>
                : <><Terminal size={14} className="text-muted" /><span className="text-sm font-medium">Terminal (xterm)</span></>
              }
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const next = consoleTab === 'vnc' ? 'terminal' : 'vnc'; setConsoleTab(next); setSessionKey(k => k + 1) }}
                className="text-xs text-muted hover:text-primary flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                {consoleTab === 'vnc'
                  ? <><Terminal size={11} /> Switch ke xterm</>
                  : <><Monitor size={11} /> Switch ke noVNC</>
                }
              </button>
              <button onClick={() => setShowConsole(false)}
                className="p-1 text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="p-3">
            <VmConsole key={sessionKey} vmId={id} initialTab={consoleTab} onRetry={() => setSessionKey(k => k + 1)} />
          </div>
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

      {/* Serial Console Toggle */}
      {(() => {
        const serialEnabled = !!vm?.proxmoxStatus?.serial0
        return (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Serial Console</h2>
                <p className="text-xs text-muted mt-0.5">
                  {serialEnabled
                    ? 'Aktif — terminal (xterm) tersedia. Reboot VM jika baru diaktifkan.'
                    : 'Nonaktif — aktifkan agar tab Terminal (xterm) berfungsi, lalu reboot VM.'}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${serialEnabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                {serialEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {serialEnabled ? (
              <button onClick={() => action('disable-serial')} disabled={!!actionLoading}
                className={`${btnBase} border border-border text-red-500 hover:bg-red-500/10`}>
                <Terminal size={14} /> Disable Serial Console
              </button>
            ) : (
              <button onClick={() => action('enable-serial')} disabled={!!actionLoading}
                className={`${btnBase} border border-border text-green-600 hover:bg-green-500/10`}>
                <Terminal size={14} /> Enable Serial Console
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
