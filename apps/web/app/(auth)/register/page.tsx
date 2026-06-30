'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Cloud } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await api.post('/auth/register', form)
      router.push('/login?registered=1')
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Registrasi gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 rounded-2xl bg-accent/10">
            <Cloud size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Buat Akun</h1>
          <p className="text-sm text-muted">Mulai deploy VPS dalam hitungan menit</p>
        </div>

        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          {[
            { key: 'fullName', label: 'Nama Lengkap', type: 'text', placeholder: 'Budi Santoso' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'email@contoh.com' },
            { key: 'phone', label: 'No. HP (opsional)', type: 'tel', placeholder: '08xxxxxxxxxx' },
            { key: 'password', label: 'Password', type: 'password', placeholder: 'Min. 8 karakter' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-sm font-medium">{label}</label>
              <input
                type={type}
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent transition-colors"
                placeholder={placeholder}
                required={key !== 'phone'}
              />
            </div>
          ))}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white font-medium py-2.5 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {loading ? 'Mendaftar...' : 'Daftar Sekarang'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-accent hover:underline">Masuk</Link>
        </p>
      </div>
    </div>
  )
}
