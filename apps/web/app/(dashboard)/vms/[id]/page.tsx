'use client'
import { useState, lazy, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useVmStatus } from '@/hooks/use-vm-status'
import { VmStatusBadge } from '@/components/vm/vm-status-badge'
import api from '@/lib/api'
import { formatDate, formatRupiah } from '@/lib/utils'
import { Copy, Terminal, RefreshCw, Play, Square, RotateCcw, Trash2 } from 'lucide-react'

const VmConsole = lazy(() => import('@/components/vm/vm-console').then(m => ({ default: m.VmConsole })))

export default function VmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { vm, loading, refetch } = useVmStatus(id)
  const [showConsole, setShowConsole] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  async function deleteVm() {
    setActionLoading('delete')
    try {
      await api.delete(`/vms/${id}`)
      router.push('/vms')
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Gagal menghapus VM')
      setActionLoading(null)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
  if (!vm) return <p className="text-muted">VM tidak ditemukan.</p>

  const isNat = vm.ipType === 'nat'
  const sshCmd = `ssh root@${vm.ipAddress}`

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
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
          >
            <Trash2 size={14} /> Hapus
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-y-4 gap-x-8">
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
          {!isNat && (
            <div>
              <p className="text-xs text-muted">IP Address</p>
              <p className="font-medium text-sm mt-0.5 font-mono">{vm.ipAddress ?? '—'}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">Username</p>
            <p className="font-medium text-sm mt-0.5 font-mono">root</p>
          </div>
          <div>
            <p className="text-xs text-muted">Paket</p>
            <p className="font-medium text-sm mt-0.5">{(vm as any).package?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Dibuat</p>
            <p className="font-medium text-sm mt-0.5">{formatDate(vm.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* SSH command — public IP only */}
      {!isNat && vm.status === 'running' && vm.ipAddress && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Perintah SSH</p>
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
            <code className="text-sm flex-1 font-mono">{sshCmd}</code>
            <button onClick={() => navigator.clipboard.writeText(sshCmd)} className="text-muted hover:text-primary">
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
