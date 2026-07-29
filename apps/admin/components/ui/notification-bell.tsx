'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, CheckCheck, Ticket, CreditCard, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

interface Notif {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  link?: string
  createdAt: string
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  ticket_created:     <Ticket size={14} className="text-blue-500" />,
  ticket_reply_user:  <Ticket size={14} className="text-amber-500" />,
  topup_success:      <CreditCard size={14} className="text-green-500" />,
  topup_failed:       <CreditCard size={14} className="text-red-500" />,
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return `${Math.floor(diff / 86400)} hari lalu`
}

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const fetchCount = useCallback(async () => {
    try {
      const r = await api.get('/admin/notifications/unread-count')
      setCount(r.data.count)
    } catch {}
  }, [])

  const fetchNotifs = useCallback(async () => {
    try {
      const r = await api.get('/admin/notifications')
      setNotifs(r.data)
      setCount(r.data.filter((n: Notif) => !n.isRead).length)
    } catch {}
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [fetchCount])

  useEffect(() => {
    if (open) fetchNotifs()
  }, [open, fetchNotifs])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function markRead(notif: Notif) {
    if (!notif.isRead) {
      await api.patch(`/admin/notifications/${notif.id}/read`).catch(() => {})
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n))
      setCount(c => Math.max(0, c - 1))
    }
    if (notif.link) { setOpen(false); router.push(notif.link) }
  }

  async function markAllRead() {
    await api.patch('/admin/notifications/read-all').catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })))
    setCount(0)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-md text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifikasi</span>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-muted hover:text-primary flex items-center gap-1"
                >
                  <CheckCheck size={12} /> Tandai semua
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted hover:text-primary">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">Tidak ada notifikasi</div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={cn(
                    'w-full text-left px-4 py-3 flex gap-3 hover:bg-accent/5 transition-colors',
                    !n.isRead && 'bg-accent/10',
                  )}
                >
                  <span className="mt-0.5 shrink-0">{TYPE_ICON[n.type] ?? <Bell size={14} className="text-muted" />}</span>
                  <div className="min-w-0">
                    <p className={cn('text-sm leading-snug', !n.isRead && 'font-semibold')}>{n.title}</p>
                    <p className="text-xs text-muted leading-snug mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-muted mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
