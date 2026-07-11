'use client'
import Link from 'next/link'
import type { Vm } from '@nova/types'
import { VmStatusBadge } from './vm-status-badge'
import { Server, Copy, Monitor, AlertTriangle } from 'lucide-react'
import { formatDate, formatOsName } from '@/lib/utils'

export function VmCard({ vm }: { vm: Vm }) {
  const isNat = vm.ipType === 'nat'
  const sshCmd = `ssh root@${vm.ipAddress}`

  function copy() {
    navigator.clipboard.writeText(sshCmd)
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Server size={18} className="text-accent" />
          </div>
          <div>
            <Link href={`/vms/${vm.id}`} className="font-medium hover:text-accent transition-colors">
              {vm.hostname}
            </Link>
            <p className="text-xs text-muted">{vm.displayId}</p>
          </div>
        </div>
        <VmStatusBadge status={vm.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-muted text-xs">Paket</p>
          <p className="font-medium">{(vm as any).package?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted text-xs">IP</p>
          <p className="font-medium font-mono">{isNat ? '—' : (vm.ipAddress ?? '—')}</p>
        </div>
        <div>
          <p className="text-muted text-xs">OS</p>
          <p className="font-medium">{(vm as any).templateName ?? formatOsName(vm.osTemplate)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">Dibuat</p>
          <p className="font-medium">{formatDate(vm.createdAt)}</p>
        </div>
      </div>

      {vm.status === 'suspended' && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <p className="font-medium">VM disuspend — saldo habis</p>
            {(vm as any).expiresAt && (
              <p className="mt-0.5 text-amber-600 dark:text-amber-400">
                Dihapus otomatis: {formatDate((vm as any).expiresAt)}
              </p>
            )}
            <Link href="/billing/topup" className="underline hover:no-underline">Topup sekarang →</Link>
          </div>
        </div>
      )}

      {vm.status === 'running' && (
        isNat ? (
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">
            <Monitor size={13} className="text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-600 dark:text-blue-400">Akses via Web Console</span>
            <Link href={`/vms/${vm.id}`} className="ml-auto text-xs text-blue-500 hover:underline">Buka →</Link>
          </div>
        ) : vm.ipAddress ? (
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
            <code className="text-xs flex-1 truncate font-mono">{sshCmd}</code>
            <button onClick={copy} className="text-muted hover:text-primary flex-shrink-0">
              <Copy size={14} />
            </button>
          </div>
        ) : null
      )}
    </div>
  )
}
