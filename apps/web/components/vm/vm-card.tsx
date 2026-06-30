'use client'
import Link from 'next/link'
import type { Vm } from '@langitnode/types'
import { VmStatusBadge } from './vm-status-badge'
import { Server, Copy } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export function VmCard({ vm }: { vm: Vm }) {
  const sshCmd = vm.ipType === 'nat'
    ? `ssh root@${vm.ipAddress} -p ${vm.sshPort}`
    : `ssh root@${vm.ipAddress}`

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
          <p className="font-medium font-mono">{vm.ipAddress ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted text-xs">OS</p>
          <p className="font-medium">{vm.osTemplate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted text-xs">Dibuat</p>
          <p className="font-medium">{formatDate(vm.createdAt)}</p>
        </div>
      </div>

      {vm.status === 'running' && vm.ipAddress && (
        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
          <code className="text-xs flex-1 truncate font-mono">{sshCmd}</code>
          <button onClick={copy} className="text-muted hover:text-primary flex-shrink-0">
            <Copy size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
