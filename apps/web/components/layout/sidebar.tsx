'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Server, CreditCard, Ticket, Settings, LogOut, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vms', label: 'VM Saya', icon: Server },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/support', label: 'Support', icon: Ticket },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
]

export function Sidebar() {
  const path = usePathname()

  function logout() {
    localStorage.clear()
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 min-h-screen flex flex-col bg-card border-r border-border">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <Cloud size={22} className="text-accent" />
        <span className="font-semibold text-lg tracking-tight">Langit Node</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              path.startsWith(href)
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5',
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <LogOut size={16} />
          Keluar
        </button>
      </div>
    </aside>
  )
}
