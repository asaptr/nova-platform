'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Send, Paperclip, X, Clock } from 'lucide-react'

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await api.get(`/tickets/${id}`)
    setTicket(data)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket?.messages?.length])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim() && !file) return
    setSending(true); setError(null)
    try {
      const form = new FormData()
      form.append('message', reply)
      if (file) form.append('attachment', file)
      await api.post(`/tickets/${id}/reply`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setReply(''); setFile(null)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Gagal mengirim')
    } finally {
      setSending(false)
    }
  }

  if (!ticket) return <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />

  const lastMsg = ticket.messages?.[ticket.messages.length - 1]
  const canReply = ticket.status !== 'closed' && lastMsg?.senderType === 'admin'
  const waitingForAdmin = ticket.status !== 'closed' && lastMsg?.senderType === 'user'
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/support" className="text-muted hover:text-primary"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-xs text-muted capitalize">{ticket.status.replace('_', ' ')} · {formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {ticket.messages?.map((msg: any) => {
          const isAdmin = msg.senderType === 'admin'
          return (
            <div key={msg.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm space-y-2 ${
                isAdmin ? 'bg-card border border-border rounded-bl-none' : 'bg-accent text-white rounded-br-none'
              }`}>
                <p className={`text-xs font-medium ${isAdmin ? 'text-accent' : 'text-white/80'}`}>
                  {isAdmin ? 'Support' : 'Anda'}
                </p>
                {msg.message && <p className="whitespace-pre-wrap">{msg.message}</p>}
                {msg.attachmentUrl && (
                  <img src={`${apiBase}${msg.attachmentUrl}`} alt="attachment"
                    className="max-w-xs rounded-lg cursor-pointer border border-black/10"
                    onClick={() => window.open(`${apiBase}${msg.attachmentUrl}`, '_blank')}
                  />
                )}
                <p className={`text-xs ${isAdmin ? 'text-muted' : 'text-white/70'}`}>{formatDate(msg.createdAt)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {ticket.status === 'closed' && (
        <div className="bg-card border border-border rounded-xl p-4 text-sm text-center text-muted">
          Tiket ini sudah ditutup.
        </div>
      )}

      {waitingForAdmin && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3 text-sm">
          <Clock size={16} className="text-amber-500 shrink-0" />
          <p className="text-amber-700 dark:text-amber-300">Menunggu balasan dari tim support. Anda akan bisa membalas setelah admin merespons.</p>
        </div>
      )}

      {canReply && (
        <form onSubmit={sendReply} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder="Tulis balasan..."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent resize-none"
          />
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted bg-background border border-border rounded-lg px-3 py-2">
              <Paperclip size={13} />
              <span className="flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)}><X size={13} /></button>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors"
            >
              <Paperclip size={14} /> Lampiran
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="submit" disabled={(!reply.trim() && !file) || sending}
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
