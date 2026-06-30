'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Server, Users, Ticket, BarChart3, Settings, LogOut, Shield, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/nodes', label: 'Node Health', icon: HardDrive },
  { href: '/vms', label: 'Semua VM', icon: Server },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/tickets', label: 'Tiket', icon: Ticket },
  { href: '/finance', label: 'Financial', icon: BarChart3, superadminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AdminSidebar() {
  const path = usePathname()
  const [role, setRole] = useState<string>('')

  useEffect(() => {
    const r = localStorage.getItem('admin_role') ?? ''
    setRole(r)
  }, [])

  function logout() {
    localStorage.clear()
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 min-h-screen flex flex-col bg-card border-r border-border">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <Shield size={20} className="text-accent" />
        <div>
          <span className="font-semibold text-sm">Langit Node</span>
          <p className="text-xs text-muted">Admin Panel</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.filter(n => !n.superadminOnly || role === 'superadmin').map(({ href, label, icon: Icon }) => (
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
            <Icon size={16} /> {label}
          </Link>
        ))}
      </nav>
      <div className="px-3 pb-4">
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </aside>
  )
}
