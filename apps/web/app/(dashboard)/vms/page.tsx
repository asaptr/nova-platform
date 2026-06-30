'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { VmCard } from '@/components/vm/vm-card'
import { Plus } from 'lucide-react'
import type { Vm } from '@langitnode/types'

export default function VmsPage() {
  const [vms, setVms] = useState<Vm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/vms').then(r => setVms(r.data)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VM Saya</h1>
          <p className="text-sm text-muted mt-1">{vms.length} VM terdaftar</p>
        </div>
        <Link
          href="/vms/new"
          className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Plus size={15} /> Buat VM
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-44 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : vms.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-16 text-center space-y-3">
          <p className="text-muted">Belum ada VM aktif.</p>
          <Link href="/vms/new" className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Plus size={15} /> Deploy VM Pertama
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vms.map(vm => <VmCard key={vm.id} vm={vm} />)}
        </div>
      )}
    </div>
  )
}
