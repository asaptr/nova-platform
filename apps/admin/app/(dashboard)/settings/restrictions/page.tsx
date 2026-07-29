'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Plus, Trash2, ArrowLeft, Send, ShieldOff } from 'lucide-react'

type Cmd = {
  id: string
  command: string
  description: string | null
  isActive: boolean
  createdAt: string
}

export default function RestrictionsPage() {
  const [cmds, setCmds] = useState<Cmd[]>([])
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [newCmd, setNewCmd] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    const { data } = await api.get('/admin/restricted-commands')
    setCmds(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function flash(text: string, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 5000)
  }

  async function add() {
    if (!newCmd.trim()) return
    try {
      await api.post('/admin/restricted-commands', { command: newCmd.trim(), description: newDesc.trim() || undefined })
      setNewCmd('')
      setNewDesc('')
      setShowForm(false)
      flash('Perintah ditambahkan')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message ?? 'Gagal menambah', false)
    }
  }

  async function toggle(c: Cmd) {
    await api.patch(`/admin/restricted-commands/${c.id}`, { isActive: !c.isActive })
    flash(c.isActive ? `${c.command} dinonaktifkan` : `${c.command} diaktifkan`)
    load()
  }

  async function remove(c: Cmd) {
    if (!confirm(`Hapus perintah "${c.command}"?`)) return
    await api.delete(`/admin/restricted-commands/${c.id}`)
    flash(`${c.command} dihapus`)
    load()
  }

  async function pushAll() {
    setPushing(true)
    try {
      const { data } = await api.post('/admin/restricted-commands/push-all')
      flash(data.message)
    } catch (e: any) {
      flash(e.response?.data?.message ?? 'Gagal push', false)
    } finally {
      setPushing(false)
    }
  }

  const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent'

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings/templates" className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Perintah Terbatas</h1>
          <p className="text-sm text-muted">Perintah yang diblokir di konsol/terminal semua VM.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={pushAll}
            disabled={pushing}
            className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-sm text-muted hover:text-primary hover:border-accent/50 transition-colors disabled:opacity-50"
          >
            <Send size={14} className={pushing ? 'animate-pulse' : ''} />
            {pushing ? 'Pushing...' : 'Push ke Semua VM'}
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
          >
            <Plus size={15} /> Tambah
          </button>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
        <p className="font-medium">Cara kerja</p>
        <p className="mt-1 text-amber-700 dark:text-amber-400">
          Perintah aktif diblokir via shell function override + symlink wrapper di seluruh path binary VM.
          Setelah ubah daftar, klik <strong>Push ke Semua VM</strong> untuk update semua VM yang sedang berjalan.
          VM baru otomatis mendapat daftar terbaru saat provisioning.
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${
          msg.ok
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        }`}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Tambah Perintah Baru</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Nama Perintah</label>
              <input
                type="text"
                value={newCmd}
                onChange={e => setNewCmd(e.target.value)}
                placeholder="contoh: dd, mkfs"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Deskripsi (opsional)</label>
              <input
                type="text"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Keterangan singkat"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-background transition-colors">
              Batal
            </button>
            <button
              onClick={add}
              disabled={!newCmd.trim()}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
            >
              Tambah
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted">Memuat...</div>
        ) : cmds.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">Belum ada perintah terbatas.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Perintah', 'Deskripsi', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmds.map(c => (
                <tr key={c.id} className="hover:bg-background/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ShieldOff size={13} className={c.isActive ? 'text-red-500' : 'text-muted'} />
                      <span className="font-mono font-medium">{c.command}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{c.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(c)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        c.isActive ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      title={c.isActive ? 'Nonaktifkan blokir' : 'Aktifkan blokir'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        c.isActive ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(c)} className="p-1 text-muted hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
