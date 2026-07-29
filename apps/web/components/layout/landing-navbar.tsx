'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Server, User, ChevronDown, LogOut, LayoutDashboard } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { useBrand } from '@/hooks/use-brand'

export function LandingNavbar() {
  const [user, setUser] = useState<{ email: string; fullName?: string } | null>(null)
  const [open, setOpen] = useState(false)
  const brand = useBrand()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setUser({ email: payload.email, fullName: payload.fullName })
    } catch {
      setUser({ email: '' })
    }
  }, [])

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    setOpen(false)
  }

  const displayName = user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || 'User'

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center">
            <Server size={14} className="text-white" />
          </div>
          <span className="font-bold">{brand.name || 'NOVA'}</span>
        </div>

        <ThemeToggle />
        {user ? (
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                <User size={13} className="text-accent" />
              </div>
              <span className="font-medium">Halo, {displayName}!</span>
              <ChevronDown size={14} className="text-muted" />
            </button>

            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-card border border-border rounded-xl shadow-lg py-1 z-20">
                  <Link
                    href="/vms"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <LayoutDashboard size={14} /> Dashboard
                  </Link>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut size={14} /> Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted hover:text-primary transition-colors">
              Masuk
            </Link>
            <Link
              href="/register"
              className="text-sm px-4 py-1.5 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-colors"
            >
              Daftar Gratis
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
