'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Server, Users, Ticket, Activity } from 'lucide-react'

export default function AdminOverviewPage() {
  const [stats, setStats] = useState({ vms: 0, users: 0, tickets: 0, nodes: [] as any[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/vms?limit=1').catch(() => ({ data: { total: 0 } })),
      api.get('/admin/users?limit=1').catch(() => ({ data: { total: 0 } })),
      api.get('/admin/tickets?status=open&limit=1').catch(() => ({ data: { total: 0 } })),
      api.get('/admin/nodes').catch(() => ({ data: [] })),
    ]).then(([vms, users, tickets, nodes]) => {
      setStats({
        vms: vms.data.total ?? 0,
        users: users.data.total ?? 0,
        tickets: tickets.data.total ?? 0,
        nodes: nodes.data ?? [],
      })
    }).finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Total VM Aktif', value: stats.vms, icon: Server, color: 'text-blue-500' },
    { label: 'Total User', value: stats.users, icon: Users, color: 'text-green-500' },
    { label: 'Tiket Terbuka', value: stats.tickets, icon: Ticket, color: 'text-amber-500' },
    { label: 'Node Online', value: stats.nodes.filter((n: any) => n.status === 'online').length, icon: Activity, color: 'text-accent' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5">
            <Icon size={20} className={color} />
            <p className="text-2xl font-bold mt-3">{loading ? '—' : value}</p>
            <p className="text-sm text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Node health cards */}
      {stats.nodes.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Node Health</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.nodes.map((node: any) => (
              <div key={node.node} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{node.node}</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    node.status === 'online' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700'
                  }`}>{node.status ?? 'online'}</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'CPU', pct: Math.round((node.cpu ?? 0) * 100) },
                    { label: 'RAM', pct: Math.round(((node.memory?.used ?? 0) / (node.memory?.total ?? 1)) * 100) },
                  ].map(({ label, pct }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-muted mb-1">
                        <span>{label}</span><span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
