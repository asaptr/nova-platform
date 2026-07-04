'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Server, Users, Ticket, Activity, AlertCircle, AlertTriangle } from 'lucide-react'

const TICKET_STATUSES = [
  { key: 'open', label: 'Open', color: 'text-green-600 dark:text-green-400' },
  { key: 'in_progress', label: 'Diproses', color: 'text-blue-600 dark:text-blue-400' },
  { key: 'waiting_admin', label: 'Tunggu Admin', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'waiting_user', label: 'Tunggu User', color: 'text-purple-600 dark:text-purple-400' },
  { key: 'resolved', label: 'Resolved', color: 'text-gray-500' },
]

export default function AdminOverviewPage() {
  const [stats, setStats] = useState({ vms: 0, users: 0, nodes: [] as any[] })
  const [ticketStats, setTicketStats] = useState<Record<string, number>>({})
  const [criticalTickets, setCriticalTickets] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/vms?limit=1').catch(() => ({ data: { total: 0 } })),
      api.get('/admin/users?limit=1').catch(() => ({ data: { total: 0 } })),
      api.get('/admin/nodes').catch(() => ({ data: [] })),
      // Fetch ticket counts per status
      ...(['open', 'in_progress', 'waiting_admin', 'waiting_user', 'resolved'].map(s =>
        api.get(`/admin/tickets?status=${s}&limit=1`).catch(() => ({ data: { total: 0 } }))
      )),
      api.get('/admin/tickets?priority=critical&limit=1').catch(() => ({ data: { total: 0 } })),
    ]).then(([vms, users, nodes, open, inProgress, waitAdmin, waitUser, resolved, critical]) => {
      setStats({
        vms: vms.data.total ?? 0,
        users: users.data.total ?? 0,
        nodes: nodes.data ?? [],
      })
      setTicketStats({
        open: open.data.total ?? 0,
        in_progress: inProgress.data.total ?? 0,
        waiting_admin: waitAdmin.data.total ?? 0,
        waiting_user: waitUser.data.total ?? 0,
        resolved: resolved.data.total ?? 0,
      })
      setCriticalTickets(critical.data.total ?? 0)
    }).finally(() => setLoading(false))
  }, [])

  const totalOpenTickets = (ticketStats.open ?? 0) + (ticketStats.in_progress ?? 0) + (ticketStats.waiting_admin ?? 0) + (ticketStats.waiting_user ?? 0)

  const cards = [
    { label: 'Total VM Aktif', value: stats.vms, icon: Server, color: 'text-blue-500' },
    { label: 'Total User', value: stats.users, icon: Users, color: 'text-green-500' },
    { label: 'Tiket Aktif', value: totalOpenTickets, icon: Ticket, color: 'text-amber-500' },
    { label: 'Node Online', value: stats.nodes.filter((n: any) => n.status === 'online').length, icon: Activity, color: 'text-accent' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5">
            <Icon size={20} className={color} />
            <p className="text-2xl font-bold mt-3">{loading ? '—' : value}</p>
            <p className="text-sm text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ticket breakdown */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Status Tiket</h2>
            {criticalTickets > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-full">
                <AlertCircle size={11} /> {criticalTickets} critical
              </span>
            )}
          </div>
          <div className="space-y-2">
            {TICKET_STATUSES.map(({ key, label, color }) => {
              const count = ticketStats[key] ?? 0
              const total = Math.max(Object.values(ticketStats).reduce((a, b) => a + b, 0), 1)
              const pct = Math.round((count / total) * 100)
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/10 rounded-full">
                    <div className="h-full bg-accent/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-sm font-semibold w-8 text-right ${color}`}>
                    {loading ? '—' : count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Node health */}
        <div className="space-y-3">
          <h2 className="font-semibold">Node Health</h2>
          {stats.nodes.length === 0 && !loading && (
            <p className="text-muted text-sm">Tidak ada node.</p>
          )}
          {stats.nodes.map((node: any) => (
            <div key={node.node} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{node.node}</p>
                  <p className="text-xs text-muted">{node.vmCount ?? 0} VM aktif</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  node.status === 'online' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700'
                }`}>{node.status ?? 'online'}</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'CPU', pct: Math.round((node.cpu ?? 0) * 100) },
                  { label: 'RAM', pct: node.memory?.total > 0 ? Math.round(((node.memory?.used ?? 0) / node.memory.total) * 100) : 0 },
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
    </div>
  )
}
