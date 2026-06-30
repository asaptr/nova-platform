'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Send } from 'lucide-react'

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  async function load() {
    const { data } = await api.get(`/tickets/${id}`)
    setTicket(data)
  }

  useEffect(() => { load() }, [id])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    try {
      await api.post(`/tickets/${id}/reply`, { message: reply })
      setReply('')
      await load()
    } finally {
      setSending(false)
    }
  }

  if (!ticket) return <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/support" className="text-muted hover:text-primary"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-xs text-muted">{ticket.status} · {formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {ticket.messages?.map((msg: any) => (
          <div key={msg.id} className={`p-4 ${msg.senderType === 'admin' ? 'bg-accent/5' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium ${msg.senderType === 'admin' ? 'text-accent' : 'text-muted'}`}>
                {msg.senderType === 'admin' ? 'Support Langit Node' : 'Anda'}
              </span>
              <span className="text-xs text-muted">{formatDate(msg.createdAt)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
          </div>
        ))}
      </div>

      {ticket.status !== 'closed' && (
        <form onSubmit={sendReply} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder="Tulis balasan..."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!reply.trim() || sending}
              className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <Send size={14} /> {sending ? 'Mengirim...' : 'Kirim'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
