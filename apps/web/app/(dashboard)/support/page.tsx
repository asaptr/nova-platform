'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Plus, AlertCircle, AlertTriangle, Info, Minus } from 'lucide-react'
import type { Ticket } from '@nova/types'

const statusColor: Record<string, string> = {
  open: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  waiting_admin: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  waiting_user: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  resolved: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
}

const statusLabel: Record<string, string> = {
  open: 'Open',
  in_progress: 'Diproses',
  waiting_admin: 'Menunggu Admin',
  waiting_user: 'Menunggu Kamu',
  resolved: 'Resolved',
  closed: 'Closed',
}

const priorityIcon: Record<string, { icon: any; color: string; label: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-500', label: 'Critical' },
  major: { icon: AlertTriangle, color: 'text-orange-500', label: 'Major' },
  minor: { icon: Info, color: 'text-blue-500', label: 'Minor' },
  normal: { icon: Minus, color: 'text-muted', label: 'Normal' },
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ subject: '', firstMessage: '', priority: 'normal' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get('/tickets').then(r => setTickets(r.data)).finally(() => setLoading(false))
  }, [])

  async function createTicket(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const { data } = await api.post('/tickets', form)
      setTickets(t => [data, ...t])
      setShowForm(false)
      setForm({ subject: '', firstMessage: '', priority: 'normal' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg"
        >
          <Plus size={15} /> Buat Tiket
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTicket} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Tiket Baru</h3>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prioritas</label>
            <div className="flex gap-2 flex-wrap">
              {(['normal', 'minor', 'major', 'critical'] as const).map(p => {
                const { icon: Icon, color, label } = priorityIcon[p]
                const active = form.priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-primary'
                    }`}
                  >
                    <Icon size={13} className={active ? 'text-accent' : color} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subjek</label>
            <input
              required value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
              placeholder="Deskripsi singkat masalah"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Pesan</label>
            <textarea
              required value={form.firstMessage}
              onChange={e => setForm(f => ({ ...f, firstMessage: e.target.value }))}
              rows={4}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent resize-none"
              placeholder="Jelaskan masalah yang Anda alami..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg text-muted hover:text-primary">Batal</button>
            <button type="submit" disabled={creating} className="px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium disabled:opacity-50">
              {creating ? 'Mengirim...' : 'Kirim Tiket'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {loading ? (
          <div className="p-5 space-y-3">{[1,2].map(i => <div key={i} className="h-14 bg-background rounded-lg animate-pulse" />)}</div>
        ) : tickets.length === 0 ? (
          <p className="p-8 text-center text-muted text-sm">Belum ada tiket support.</p>
        ) : tickets.map(t => {
          const pInfo = priorityIcon[t.priority ?? 'normal'] ?? priorityIcon.normal
          const PIcon = pInfo.icon
          return (
            <Link key={t.id} href={`/support/${t.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-background/50 transition-colors">
              <PIcon size={15} className={pInfo.color} title={pInfo.label} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.subject}</p>
                <p className="text-xs text-muted">{formatDate(t.createdAt)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[t.status] ?? statusColor.open}`}>
                {statusLabel[t.status] ?? t.status}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
