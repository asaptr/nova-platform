'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Shield } from 'lucide-react'
import { ThemeToggle } from '@/components/layout/theme-toggle'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export default function AdminLoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [brandName, setBrandName] = useState('NOVA')

  useEffect(() => {
    fetch(`${API}/brand`).then(r => r.json()).then(d => { if (d?.name) setBrandName(d.name) }).catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const { data } = await api.post('/admin/auth/login', form)
      localStorage.setItem('admin_token', data.accessToken)
      localStorage.setItem('admin_role', data.admin.role)
      localStorage.setItem('admin_email', data.admin.email)
      router.push('/')
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Login gagal')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 rounded-2xl bg-accent/10">
            <Shield size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-sm text-muted">{brandName} — Panel Operator</p>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <input type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
              placeholder="admin@domain.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <input type="password" required value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-accent text-white font-medium py-2.5 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
