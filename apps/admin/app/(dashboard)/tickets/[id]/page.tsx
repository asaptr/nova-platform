'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Send, Paperclip, X } from 'lucide-react'

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await api.get(`/admin/tickets/${id}`)
    setTicket(data); setNewStatus(data.status)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket?.messages?.length])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim() && !file) return
    setSending(true)
    try {
      const formData = new FormData()
      formData.append('message', reply)
      if (file) formData.append('attachment', file)
      // Do NOT set Content-Type manually — axios sets multipart/form-data with correct boundary
      await api.post(`/admin/tickets/${id}/reply`, formData)
      setReply(''); setFile(null)
      await load()
    } finally {
      setSending(false)
    }
  }

  async function updateStatus() {
    await api.patch(`/admin/tickets/${id}`, { status: newStatus })
    setTicket((t: any) => ({ ...t, status: newStatus }))
  }

  if (loading) return <div className="text-sm text-muted">Memuat...</div>
  if (!ticket) return <div className="text-sm text-red-500">Tiket tidak ditemukan.</div>

  const adminEmail = typeof window !== 'undefined' ? localStorage.getItem('admin_email') : ''
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'

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

      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-muted">Status:</label>
        <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
        >
          {[
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'Diproses' },
            { value: 'waiting_admin', label: 'Menunggu Admin' },
            { value: 'waiting_user', label: 'Menunggu User' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ].map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button onClick={updateStatus}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        >
          Simpan
        </button>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded font-medium ${
          ticket.priority === 'critical' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' :
          ticket.priority === 'major' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
          ticket.priority === 'minor' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
          'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }`}>{ticket.priority}</span>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {ticket.messages?.map((m: any) => {
          const isAdmin = m.senderType === 'admin'
          return (
            <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm space-y-2 ${
                isAdmin ? 'bg-accent text-white rounded-br-none' : 'bg-card border border-border rounded-bl-none'
              }`}>
                {m.message && <p className="whitespace-pre-wrap">{m.message}</p>}
                {m.attachmentUrl && (
                  <img src={`${apiBase}${m.attachmentUrl}`} alt="attachment"
                    className="max-w-xs rounded-lg border border-white/20 cursor-pointer"
                    onClick={() => window.open(`${apiBase}${m.attachmentUrl}`, '_blank')}
                  />
                )}
                <p className={`text-xs ${isAdmin ? 'text-white/70' : 'text-muted'}`}>
                  {isAdmin ? (adminEmail ?? 'Admin') : ticket.user?.email} · {formatDate(m.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {ticket.status !== 'closed' && (
        <form onSubmit={sendReply} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Tulis balasan..."
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent resize-none"
          />
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted bg-background border border-border rounded-lg px-3 py-2">
              <Paperclip size={13} />
              <span className="flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)}><X size={13} /></button>
            </div>
          )}
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
