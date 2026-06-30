'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Send } from 'lucide-react'

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await api.get(`/admin/tickets/${id}`)
    setTicket(data); setNewStatus(data.status)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket?.messages?.length])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    await api.post(`/admin/tickets/${id}/reply`, { message: reply })
    setReply('')
    await load()
    setSending(false)
  }

  async function updateStatus() {
    await api.patch(`/admin/tickets/${id}/status`, { status: newStatus })
    setTicket((t: any) => ({ ...t, status: newStatus }))
  }

  if (loading) return <div className="text-sm text-muted">Memuat...</div>
  if (!ticket) return <div className="text-sm text-red-500">Tiket tidak ditemukan.</div>

  const adminEmail = typeof window !== 'undefined' ? localStorage.getItem('admin_email') : ''

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{ticket.subject}</h1>
          <p className="text-xs text-muted">{ticket.user?.email} · dibuat {formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      {/* Status control */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
        <label className="text-sm text-muted">Status:</label>
        <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
        >
          {['open', 'in_progress', 'resolved', 'closed'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <button onClick={updateStatus}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        >
          Simpan
        </button>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded font-medium ${
          ticket.priority === 'urgent' ? 'bg-red-50 text-red-700' :
          ticket.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
        }`}>{ticket.priority}</span>
      </div>

      {/* Messages */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {ticket.messages?.map((m: any) => {
          const isAdmin = m.senderType === 'admin'
          return (
            <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                isAdmin
                  ? 'bg-accent text-white rounded-br-none'
                  : 'bg-card border border-border rounded-bl-none'
              }`}>
                <p className="whitespace-pre-wrap">{m.message}</p>
                <p className={`text-xs mt-1.5 ${isAdmin ? 'text-white/70' : 'text-muted'}`}>
                  {isAdmin ? (m.adminUser?.email ?? adminEmail) : ticket.user?.email} · {formatDate(m.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {ticket.status !== 'closed' && (
        <form onSubmit={sendReply} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Tulis balasan..."
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end">
            <button type="submit" disabled={!reply.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
            >
              <Send size={14} /> {sending ? 'Mengirim...' : 'Kirim Balasan'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
