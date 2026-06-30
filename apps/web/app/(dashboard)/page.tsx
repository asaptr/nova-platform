'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { BalanceCard } from '@/components/billing/balance-card'
import { VmCard } from '@/components/vm/vm-card'
import { Plus } from 'lucide-react'
import type { Vm, User } from '@langitnode/types'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [vms, setVms] = useState<Vm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/users/me'),
      api.get('/vms'),
    ]).then(([u, v]) => {
      setUser(u.data)
      setVms(v.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="animate-pulse space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl" />)}
    </div>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Selamat datang, {user?.fullName?.split(' ')[0] ?? 'User'} 👋</h1>
        <p className="text-muted text-sm mt-1">Kelola VPS cloud Anda dari sini.</p>
      </div>

      <BalanceCard balance={Number(user?.balance ?? 0)} />

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">VM Saya ({vms.length})</h2>
        <Link
          href="/vms/new"
          className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Plus size={15} />
          Buat VM
        </Link>
      </div>

      {vms.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
          <p className="text-muted">Belum ada VM. Deploy VM pertama Anda sekarang!</p>
          <Link
            href="/vms/new"
            className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Plus size={15} /> Deploy VM
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
