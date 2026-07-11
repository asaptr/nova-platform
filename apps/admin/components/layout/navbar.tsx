'use client'
import { ThemeToggle } from './theme-toggle'
import { AdminNotificationBell } from '@/components/ui/notification-bell'

export function AdminNavbar() {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-5">
      <span className="text-sm text-muted">Admin Panel</span>
      <div className="flex items-center gap-3">
        <AdminNotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
