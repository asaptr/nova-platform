'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Plus, X, Check, ShieldOff, Shield } from 'lucide-react'

export default function AdminManagementPage() {
  const [admins, setAdmins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', role: 'admin' })
  const [msg, setMsg] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState('')

  useEffect(() => {
    setCurrentRole(localStorage.getItem('admin_role') ?? '')
    load()
  }, [])

  async function load() {
    const { data } = await api.get('/admin/auth/admins')
    setAdmins(data)
    setLoading(false)
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/admin/auth/admins', form)
      setMsg('Admin berhasil dibuat')
      setShowForm(false)
      setForm({ email: '', password: '', role: 'admin' })
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message ?? 'Gagal membuat admin')
    }
  }

  async function toggle(id: string, isActive: boolean) {
    await api.patch(`/admin/auth/admins/${id}`, { isActive: !isActive })
    load()
  }

  const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent'

  if (currentRole !== 'superadmin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted text-sm">Hanya superadmin yang dapat mengakses halaman ini.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Admin</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        >
          <Plus size={14} /> Tambah Admin
        </button>
      </div>

      {msg && <p className="text-sm text-blue-600 dark:text-blue-400">{msg}</p>}

      {showForm && (
        <form onSubmit={createAdmin} className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-md">
          <h2 className="font-semibold">Admin Baru</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Email</label>
              <input required type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputCls} placeholder="admin@langitnode.id" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Password</label>
              <input required type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className={inputCls} placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className={inputCls}>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm hover:bg-background transition-colors">
              <X size={14} /> Batal
            </button>
            <button type="submit"
              className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors">
              <Check size={14} /> Buat Admin
            </button>
          </div>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Email', 'Role', 'Status', 'Dibuat', 'Aksi'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-background rounded animate-pulse" /></td></tr>
              ))
            ) : admins.map(a => (
              <tr key={a.id} className="hover:bg-background/50">
                <td className="px-4 py-3 font-medium">{a.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    a.role === 'superadmin'
                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                  }`}>{a.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    a.isActive
                      ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                  }`}>{a.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td className="px-4 py-3 text-muted text-xs">{formatDate(a.createdAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(a.id, a.isActive)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                      a.isActive
                        ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
                        : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30'
                    }`}
                  >
                    {a.isActive ? <><ShieldOff size={12} /> Nonaktifkan</> : <><Shield size={12} /> Aktifkan</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && admins.length === 0 && (
          <p className="text-center py-8 text-muted text-sm">Tidak ada admin.</p>
        )}
      </div>
    </div>
  )
}
