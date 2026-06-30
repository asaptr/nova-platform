'use client'
import { useState, lazy, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { useVmStatus } from '@/hooks/use-vm-status'
import { VmStatusBadge } from '@/components/vm/vm-status-badge'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { Copy, Terminal, RefreshCw, Play, Square, RotateCcw } from 'lucide-react'

const VmConsole = lazy(() => import('@/components/vm/vm-console').then(m => ({ default: m.VmConsole })))

export default function VmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { vm, loading, refetch } = useVmStatus(id)
  const [showConsole, setShowConsole] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)

  async function action(type: string, body?: Record<string, any>) {
    setActionLoading(type)
    try {
      await api.post(`/vms/${id}/${type}`, body ?? {})
      setTimeout(refetch, 1500)
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Gagal')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
  if (!vm) return <p className="text-muted">VM tidak ditemukan.</p>

  const isNat = vm.ipType === 'nat'
  const sshCmd = isNat ? `ssh root@${vm.ipAddress} -p ${vm.sshPort}` : `ssh root@${vm.ipAddress}`

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{vm.hostname}</h1>
            <VmStatusBadge status={vm.status} />
          </div>
          <p className="text-muted text-sm mt-1">{vm.displayId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => action('start')}
            disabled={vm.status === 'running' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-primary disabled:opacity-40 transition-colors"
          >
            <Play size={14} /> Start
          </button>
          <button
            onClick={() => action('stop')}
            disabled={vm.status !== 'running' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-primary disabled:opacity-40 transition-colors"
          >
            <Square size={14} /> Stop
          </button>
          <button
            onClick={() => action('reboot')}
            disabled={vm.status !== 'running' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-primary disabled:opacity-40 transition-colors"
          >
            <RotateCcw size={14} /> Reboot
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-2 gap-y-4 gap-x-8">
        {[
          ['IP Address', vm.ipAddress ?? '—'],
          ['Port SSH', vm.sshPort ?? '—'],
          ['Username', 'root'],
          ['OS', vm.osTemplate ?? '—'],
          ['Paket', (vm as any).package?.name ?? '—'],
          ['Dibuat', formatDate(vm.createdAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-muted">{k}</p>
            <p className="font-medium text-sm mt-0.5 font-mono">{String(v)}</p>
          </div>
        ))}
      </div>

      {/* SSH command */}
      {vm.status === 'running' && vm.ipAddress && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Perintah SSH</p>
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
            <code className="text-sm flex-1 font-mono">{sshCmd}</code>
            <button
              onClick={() => navigator.clipboard.writeText(sshCmd)}
              className="text-muted hover:text-primary"
            >
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

      {/* Console */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Console VM</p>
          <button
            onClick={() => setShowConsole(v => !v)}
            disabled={vm.status !== 'running'}
            className="flex items-center gap-1.5 text-sm text-accent hover:underline disabled:opacity-40"
          >
            <Terminal size={14} /> {showConsole ? 'Tutup Console' : 'Buka Console'}
          </button>
        </div>
        {showConsole && (
          <Suspense fallback={<div className="h-32 bg-black rounded-xl animate-pulse" />}>
            <VmConsole vmId={id} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
