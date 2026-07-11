'use client'
import { useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useVmStatus } from '@/hooks/use-vm-status'
import { VmStatusBadge } from '@/components/vm/vm-status-badge'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { useBrand } from '@/hooks/use-brand'
import { useToast } from '@/components/ui/toast'
import { Copy, Terminal, RefreshCw, Play, Square, RotateCcw, Trash2, Cpu, MemoryStick, HardDrive, Clock, Activity, Gauge, Power, PowerOff, KeyRound, Monitor, AlertTriangle, PauseCircle, PlayCircle, ChevronDown, X } from 'lucide-react'

const VmConsole = lazy(() => import('@/components/vm/vm-console').then(m => ({ default: m.VmConsole })))

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'vm.create':          { label: 'VM dibuat',               icon: <Play size={11} />,         color: 'text-green-500 bg-green-500/10' },
  'vm.start':           { label: 'VM dinyalakan',           icon: <Power size={11} />,        color: 'text-green-500 bg-green-500/10' },
  'vm.stop':            { label: 'VM dimatikan',            icon: <PowerOff size={11} />,     color: 'text-red-500 bg-red-500/10' },
  'vm.reboot':          { label: 'VM di-reboot',            icon: <RotateCcw size={11} />,    color: 'text-amber-500 bg-amber-500/10' },
  'vm.delete':          { label: 'VM dihapus',              icon: <Trash2 size={11} />,       color: 'text-red-600 bg-red-500/10' },
  'vm.reset_password':  { label: 'Reset password root',     icon: <KeyRound size={11} />,     color: 'text-blue-500 bg-blue-500/10' },
  'vm.console_access':  { label: 'Buka console (noVNC)',    icon: <Monitor size={11} />,      color: 'text-muted bg-border/60' },
  'vm.terminal_access': { label: 'Buka terminal (xterm)',   icon: <Terminal size={11} />,     color: 'text-muted bg-border/60' },
  'vm.suspend':         { label: 'VM disuspend (tagihan)',  icon: <PauseCircle size={11} />,  color: 'text-amber-500 bg-amber-500/10' },
  'vm.unsuspend':       { label: 'VM diaktifkan kembali',   icon: <PlayCircle size={11} />,   color: 'text-green-500 bg-green-500/10' },
  'vm.resize':          { label: 'Spesifikasi diubah',      icon: <RefreshCw size={11} />,    color: 'text-blue-500 bg-blue-500/10' },
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action]
  if (!meta) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-border/60 text-muted">
      <AlertTriangle size={11} /> {action}
    </span>
  )
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.color}`}>
      {meta.icon} {meta.label}
    </span>
  )
}

const TRANSIENT_LABELS: Partial<Record<string, string>> = {
  starting:  'VM sedang dinyalakan...',
  stopping:  'VM sedang dimatikan...',
  rebooting: 'VM sedang di-reboot...',
}

const TRANSITION_TOASTS: Record<string, Record<string, { msg: string; type: 'success' | 'error' }>> = {
  starting:  { running: { msg: 'VM berhasil dinyalakan', type: 'success' }, stopped: { msg: 'VM gagal dinyalakan', type: 'error' } },
  stopping:  { stopped: { msg: 'VM berhasil dimatikan', type: 'success' } },
  rebooting: { running: { msg: 'VM berhasil di-reboot', type: 'success' } },
}

function getGmtLabel(timezone: string): string {
  try {
    const now = new Date()
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tz  = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    const diffH = Math.round((tz.getTime() - utc.getTime()) / 3_600_000)
    return `GMT${diffH >= 0 ? '+' : ''}${diffH}`
  } catch { return 'GMT+7' }
}

function formatLogDate(iso: string, timezone = 'Asia/Jakarta'): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}:${get('second')} ${getGmtLabel(timezone)}`
}

function formatRam(ramMb: number) {
  return ramMb >= 1024 ? `${ramMb / 1024} GB` : `${ramMb} MB`
}

interface VmLog {
  id: string
  action: string
  actorType: string
  actorLabel: string
  createdAt: string
}

interface VmStats {
  cpu: number
  mem: number
  maxmem: number
  pkgRamMb: number | null
  uptime: number
  status: string
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}d`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h < 24) return `${h}j ${m}m`
  const d = Math.floor(h / 24)
  return `${d}h ${h % 24}j`
}

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  return `${Math.round(bytes / 1048576)} MB`
}

export default function VmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { vm, loading, refetch, onTransition } = useVmStatus(id)
  const { timezone } = useBrand()
  const { toast } = useToast()

  onTransition((from, to) => {
    const t = TRANSITION_TOASTS[from]?.[to]
    if (t) toast(t.msg, t.type)
  })
  const [showConsole, setShowConsole] = useState(false)
  const [consoleTab, setConsoleTab] = useState<'vnc' | 'terminal'>('vnc')
  const [sessionKey, setSessionKey] = useState(0)
  const [consoleDropdown, setConsoleDropdown] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [logs, setLogs] = useState<VmLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [stats, setStats] = useState<VmStats | null>(null)

  useEffect(() => {
    api.get(`/vms/${id}/logs`)
      .then(r => setLogs(r.data))
      .catch(() => {})
      .finally(() => setLogsLoading(false))
  }, [id])

  useEffect(() => {
    if (!vm || vm.status !== 'running') return
    const fetchStats = () => {
      api.get(`/vms/${id}/stats`).then(r => setStats(r.data)).catch(() => {})
    }
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [id, vm?.status])

  async function action(type: string, body?: Record<string, any>) {
    setActionLoading(type)
    try {
      await api.post(`/vms/${id}/${type}`, body ?? {})
      if (type === 'reset-password') {
        toast('Password root berhasil direset')
        setNewPassword('')
        setShowResetPw(false)
      }
      setTimeout(() => {
        refetch()
        api.get(`/vms/${id}/logs`).then(r => setLogs(r.data)).catch(() => {})
      }, 800)
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Terjadi kesalahan', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  async function deleteVm() {
    setActionLoading('delete')
    try {
      await api.delete(`/vms/${id}`)
      router.push('/vms')
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Gagal menghapus VM', 'error')
      setActionLoading(null)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
  if (!vm) return <p className="text-muted">VM tidak ditemukan.</p>

  const isNat = vm.ipType === 'nat'
  const sshCmd = `ssh root@${vm.ipAddress}`
  const pkg = (vm as any).package
  const isTransient = ['starting', 'stopping', 'rebooting'].includes(vm.status)
  const isDisabled = isTransient || !!actionLoading

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold">{vm.hostname}</h1>
            <VmStatusBadge status={vm.status} />
          </div>
          <p className="text-muted text-xs mt-0.5">{vm.displayId}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Start */}
          <button onClick={() => action('start')} disabled={vm.status === 'running' || isDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 transition-colors">
            <Play size={13} /> Start
          </button>
          {/* Stop */}
          <button onClick={() => action('stop')} disabled={vm.status !== 'running' || isDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors">
            <Square size={13} /> Stop
          </button>
          {/* Reboot */}
          <button onClick={() => action('reboot')} disabled={vm.status !== 'running' || isDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors">
            <RotateCcw size={13} /> Reboot
          </button>
          {/* Console dropdown */}
          <div className="relative">
            <div className="flex items-center rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => { setShowConsole(true); setConsoleDropdown(false) }}
                disabled={vm.status !== 'running' || isDisabled}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                <Monitor size={13} /> Konsol
              </button>
              <button
                onClick={() => setConsoleDropdown(v => !v)}
                disabled={vm.status !== 'running' || isDisabled}
                className="px-1.5 py-1.5 text-xs border-l border-border bg-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                <ChevronDown size={13} />
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
          {/* Delete */}
          <button onClick={() => setShowDeleteConfirm(true)} disabled={isDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-200 dark:border-red-900 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
            <Trash2 size={13} /> Hapus VM
          </button>
        </div>
      </div>

      {/* Console inline frame */}
      {showConsole && (
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
            <Suspense fallback={<div className="h-32 bg-black rounded-xl animate-pulse" />}>
              <VmConsole key={sessionKey} vmId={id} initialTab={consoleTab} onRetry={() => setSessionKey(k => k + 1)} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Transient state progress bar */}
      {isTransient && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {TRANSIENT_LABELS[vm.status] ?? 'VM sedang diproses...'}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 ml-auto">Halaman ini otomatis update</p>
        </div>
      )}

      {/* Info + Specs side by side on md+ */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Info grid */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Info VM</p>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <div>
              <p className="text-xs text-muted">Tipe Jaringan</p>
              <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded font-medium ${
                isNat ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
              }`}>{isNat ? 'NAT' : 'Public IP'}</span>
            </div>
            <div>
              <p className="text-xs text-muted">OS</p>
              <p className="font-medium text-sm mt-0.5">{(vm as any).templateName ?? vm.osTemplate ?? '—'}</p>
            </div>
            <div className={isNat ? undefined : 'col-span-2'}>
              <p className="text-xs text-muted">{isNat ? 'IP Private' : 'IP Address'}</p>
              <p className="font-medium text-sm mt-0.5 font-mono">{vm.ipAddress ?? '—'}</p>
            </div>
            {isNat && vm.sshPort && (
              <div>
                <p className="text-xs text-muted">SSH Port</p>
                <p className="font-medium text-sm mt-0.5 font-mono">{vm.sshPort}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted">Username</p>
              <p className="font-medium text-sm mt-0.5 font-mono">root</p>
            </div>
            <div>
              <p className="text-xs text-muted">Paket</p>
              <p className="font-medium text-sm mt-0.5">{pkg?.name ?? '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted">Dibuat</p>
              <p className="font-medium text-sm mt-0.5">{formatDate(vm.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Specs + Pricing */}
        {pkg && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Spesifikasi & Harga</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent/10">
                <Cpu size={14} className="text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted">vCPU</p>
                <p className="font-semibold text-sm">{pkg.vcpu} Core</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent/10">
                <MemoryStick size={14} className="text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted">RAM</p>
                <p className="font-semibold text-sm">{formatRam(pkg.ramMb)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent/10">
                <HardDrive size={14} className="text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted">SSD</p>
                <p className="font-semibold text-sm">{pkg.diskGb} GB</p>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-3 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted" />
              <div>
                <p className="text-xs text-muted">Per Jam</p>
                <p className="font-semibold text-sm text-accent">{formatRupiah(Number(pkg.priceHourly))}</p>
              </div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-xs text-muted">Per Bulan</p>
              <p className="font-semibold text-sm">{formatRupiah(Number(pkg.priceMonthly))}</p>
            </div>
          </div>
        </div>
      )}
      </div>{/* end grid md:grid-cols-2 */}

      {/* Realtime stats */}
      {vm.status === 'running' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-muted" />
            <p className="text-sm font-semibold">Penggunaan Realtime</p>
            {!stats && <span className="text-xs text-muted">Memuat...</span>}
            {stats && (
              <span className="ml-auto text-xs text-muted">
                Uptime: <span className="font-medium text-primary">{formatUptime(stats.uptime)}</span>
              </span>
            )}
          </div>
          {stats && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted flex items-center gap-1.5"><Cpu size={12} /> CPU</span>
                  <span className="font-medium">{Math.round(stats.cpu * 100)}%</span>
                </div>
                <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(Math.round(stats.cpu * 100), 100)}%` }}
                  />
                </div>
              </div>
              {(() => {
                const ramMax = stats.pkgRamMb ? stats.pkgRamMb * 1024 * 1024 : stats.maxmem
                const ramPct = ramMax > 0 ? Math.min(Math.round((stats.mem / ramMax) * 100), 100) : 0
                const ramLabel = stats.pkgRamMb ? formatRam(stats.pkgRamMb) : formatBytes(stats.maxmem)
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted flex items-center gap-1.5"><MemoryStick size={12} /> RAM</span>
                      <span className="font-medium">{formatBytes(stats.mem)} / {ramLabel} ({ramPct}%)</span>
                    </div>
                    <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${ramPct}%` }} />
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
          {!stats && (
            <div className="space-y-3">
              <div className="h-2 bg-border/50 rounded animate-pulse" />
              <div className="h-2 bg-border/50 rounded animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* SSH command — public IP only */}
      {!isNat && vm.status === 'running' && vm.ipAddress && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Perintah SSH</p>
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
            <code className="text-sm flex-1 font-mono">{sshCmd}</code>
            <button onClick={() => { navigator.clipboard.writeText(sshCmd); toast('SSH command disalin') }} className="text-muted hover:text-primary">
              <Copy size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Provisioning spinner */}
      {(vm.status === 'pending' || vm.status === 'provisioning') && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-5 flex items-center gap-3">
          <RefreshCw size={18} className="text-blue-500 animate-spin" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-300">VM sedang diproses...</p>
            <p className="text-sm text-blue-600 dark:text-blue-400">Estimasi 30 detik – 2 menit. Halaman ini otomatis update.</p>
          </div>
        </div>
      )}

      {/* Reset password */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Reset Password Root</p>
          <button
            onClick={() => setShowResetPw(v => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showResetPw ? 'Batal' : 'Reset'}
          </button>
        </div>
        {showResetPw && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Password baru (min 8 karakter)"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => action('reset-password', { password: newPassword })}
              disabled={newPassword.length < 8 || !!actionLoading}
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-muted" />
          <p className="font-medium text-sm">Riwayat Aktivitas</p>
        </div>
        {logsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-border/50 rounded animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted">Belum ada aktivitas tercatat.</p>
        ) : (
          <div className="divide-y divide-border">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <ActionBadge action={log.action} />
                  <span className="text-xs text-muted shrink-0">oleh {log.actorLabel}</span>
                </div>
                <p className="text-xs text-muted shrink-0 font-mono whitespace-nowrap">{formatLogDate(log.createdAt, timezone)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold">Hapus VM?</p>
                <p className="text-xs text-muted mt-0.5">{vm.hostname} · {vm.displayId}</p>
              </div>
            </div>
            <p className="text-sm text-muted">
              VM akan dihentikan dan dihapus permanen dari server. Tagihan berhenti setelah VM dihapus.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={actionLoading === 'delete'}
                className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={deleteVm}
                disabled={actionLoading === 'delete'}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'delete' ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
