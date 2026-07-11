'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Server, Users, Ticket, BarChart3, Settings, LogOut, Shield, HardDrive, Cog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/nodes', label: 'Node Health', icon: HardDrive },
  { href: '/vms', label: 'Semua VM', icon: Server },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/tickets', label: 'Tiket', icon: Ticket },
  { href: '/finance', label: 'Financial', icon: BarChart3, superadminOnly: true },
  { href: '/settings/packages', label: 'Settings', icon: Settings },
  { href: '/settings/system', label: 'Sistem', icon: Cog, superadminOnly: true },
]

export function AdminSidebar() {
  const path = usePathname()
  const [role, setRole] = useState<string>('')
  const [brandName, setBrandName] = useState('NOVA')

  useEffect(() => {
    const r = localStorage.getItem('admin_role') ?? ''
    setRole(r)
    fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'}/api/v1/brand`)
      .then(r => r.json())
      .then(d => { if (d.name) setBrandName(d.name) })
      .catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_role')
    localStorage.removeItem('admin_email')
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 h-full flex flex-col bg-card border-r border-border overflow-y-auto">
      <Link href="/" className="flex items-center gap-2 px-5 py-5 border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <Shield size={20} className="text-accent flex-shrink-0" />
        <div className="min-w-0">
          <span className="font-semibold text-sm block truncate">{brandName}</span>
          <p className="text-xs text-muted">NOVA · Admin</p>
        </div>
      </Link>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.filter(n => !n.superadminOnly || role === 'superadmin').map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              (href === '/' ? path === '/' : path.startsWith(href))
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
