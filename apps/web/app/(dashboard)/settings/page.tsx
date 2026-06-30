'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

export default function SettingsPage() {
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' })
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.get('/users/me').then(r => setProfile(r.data))
  }, [])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null); setErr(null)
    try {
      await api.patch('/users/me', { fullName: profile.fullName, phone: profile.phone })
      setMsg('Profil berhasil disimpan')
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null); setErr(null)
    try {
      await api.post('/users/me/change-password', pw)
      setMsg('Password berhasil diubah')
      setPw({ oldPassword: '', newPassword: '' })
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Gagal mengubah password')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Pengaturan</h1>

      {msg && <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">{msg}</div>}
      {err && <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{err}</div>}

      <form onSubmit={saveProfile} className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Profil</h2>
        {[
          { key: 'email', label: 'Email', disabled: true },
          { key: 'fullName', label: 'Nama Lengkap', disabled: false },
          { key: 'phone', label: 'No. HP', disabled: false },
        ].map(({ key, label, disabled }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            <input
              value={(profile as any)[key] ?? ''}
              onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
              disabled={disabled}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        ))}
        <button type="submit" disabled={saving} className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Profil'}
        </button>
      </form>

      <form onSubmit={changePassword} className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Ubah Password</h2>
        {[
          { key: 'oldPassword', label: 'Password Lama' },
          { key: 'newPassword', label: 'Password Baru' },
        ].map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            <input
              type="password"
              value={(pw as any)[key]}
              onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent"
              required
            />
          </div>
        ))}
        <button type="submit" disabled={saving} className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Ubah Password'}
        </button>
      </form>
    </div>
  )
}
