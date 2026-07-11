'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Server, CreditCard, Ticket, Settings, LogOut, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const nav = [
  { href: '/vms', label: 'VM Saya', icon: Server },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/support', label: 'Support', icon: Ticket },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
]

export function Sidebar() {
  const path = usePathname()
  const [brandName, setBrandName] = useState('NOVA')

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'}/api/v1/brand`)
      .then(r => r.json())
      .then(d => { if (d.name) setBrandName(d.name) })
      .catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 h-full flex flex-col bg-card border-r border-border overflow-y-auto">
      <Link href="/vms" className="flex items-center gap-2 px-5 py-5 border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <Cloud size={22} className="text-accent flex-shrink-0" />
        <span className="font-semibold text-lg tracking-tight truncate">{brandName}</span>
      </Link>

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
