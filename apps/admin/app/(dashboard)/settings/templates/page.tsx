'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Plus, Pencil, Trash2, ArrowLeft, RefreshCw } from 'lucide-react'

type Template = {
  id: string; name: string; description: string | null; badge: string | null
  osFamily: string; proxmoxValue: string; isActive: boolean; sortOrder: number; templateType: string
}

type ProxmoxVm = { vmid: string; name: string; status: string; isTemplate: boolean }
type ProxmoxIso = { volid: string; name: string; storage: string }

const emptyForm = { name: '', description: '', badge: '', osFamily: 'linux', proxmoxValue: '', sortOrder: 0, templateType: 'clone' }

const BADGE_PRESETS = ['Recommended', 'Popular', 'New', 'LTS', 'Beta', 'Sale']

const OS_FAMILIES = ['linux', 'windows', 'freebsd', 'other']

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...emptyForm })
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [proxmoxVms, setProxmoxVms] = useState<ProxmoxVm[]>([])
  const [proxmoxIsos, setProxmoxIsos] = useState<ProxmoxIso[]>([])
  const [loadingProxmox, setLoadingProxmox] = useState(false)

  async function load() {
    const { data } = await api.get('/admin/templates')
    setTemplates(data)
    setLoading(false)
  }

  async function loadProxmox() {
    setLoadingProxmox(true)
    try {
      const { data } = await api.get('/admin/proxmox/resources')
      setProxmoxVms(data.vms ?? [])
      setProxmoxIsos(data.isos ?? [])
    } catch {
      flash('Gagal memuat resource Proxmox', false)
    } finally {
      setLoadingProxmox(false)
    }
  }

  useEffect(() => { load() }, [])

  function flash(text: string, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  function startCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
    loadProxmox()
  }

  function startEdit(t: Template) {
    setEditId(t.id)
    setForm({
      name: t.name,
      description: t.description ?? '',
      badge: t.badge ?? '',
      osFamily: t.osFamily,
      proxmoxValue: t.proxmoxValue,
      sortOrder: t.sortOrder,
      templateType: t.templateType ?? 'clone',
    })
    setShowForm(true)
    loadProxmox()
  }

  async function save() {
    try {
      if (editId) {
        await api.patch(`/admin/templates/${editId}`, form)
      } else {
        await api.post('/admin/templates', form)
      }
      setShowForm(false)
      flash(editId ? 'Template diperbarui' : 'Template ditambahkan')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message ?? 'Gagal menyimpan', false)
    }
  }

  async function toggle(t: Template) {
    await api.patch(`/admin/templates/${t.id}`, { isActive: !t.isActive })
    flash(t.isActive ? 'Template dinonaktifkan' : 'Template diaktifkan')
    load()
  }

  async function remove(id: string) {
    if (!confirm('Hapus template ini?')) return
    await api.delete(`/admin/templates/${id}`)
    flash('Template dihapus')
    load()
  }

  const vmOptions = proxmoxVms.filter(v => v.isTemplate || v.status !== 'running')
  const isoOptions = proxmoxIsos

  const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent'

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings/packages" className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">OS Templates</h1>
          <p className="text-sm text-muted">Kelola template yang tersedia saat user buat VM.</p>
        </div>
        <button onClick={startCreate} className="ml-auto flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors">
          <Plus size={15} /> Tambah
        </button>
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
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">{editId ? 'Edit Template' : 'Template Baru'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Nama Tampilan</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ubuntu 22.04 LTS"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Deskripsi (opsional)</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="LTS, stable"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Badge (opsional)</label>
              <input
                type="text"
                value={form.badge}
                onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
                placeholder="Recommended, New, LTS, ..."
                className={inputCls}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {BADGE_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, badge: f.badge === p ? '' : p }))}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      form.badge === p
                        ? 'bg-accent text-white border-accent'
                        : 'border-border text-muted hover:border-accent/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">OS Family</label>
              <select
                value={form.osFamily}
                onChange={e => setForm(f => ({ ...f, osFamily: e.target.value }))}
                className={inputCls}
              >
                {OS_FAMILIES.map(f => (
                  <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Urutan tampil</label>
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: +e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Tipe Template</label>
            <select
              value={form.templateType}
              onChange={e => setForm(f => ({ ...f, templateType: e.target.value, proxmoxValue: '' }))}
              className={inputCls}
            >
              <option value="clone">Clone VM (dari template di Proxmox)</option>
              <option value="iso">ISO (install dari CD/ISO)</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted">
                {form.templateType === 'clone' ? 'Pilih VM Template (dari Proxmox)' : 'Pilih ISO (dari storage Proxmox)'}
              </label>
              <button
                type="button"
                onClick={loadProxmox}
                disabled={loadingProxmox}
                className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={loadingProxmox ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingProxmox ? (
              <div className={`${inputCls} text-muted`}>Memuat dari Proxmox...</div>
            ) : form.templateType === 'clone' ? (
              vmOptions.length === 0 ? (
                <div className={`${inputCls} text-muted`}>Tidak ada VM di Proxmox. Klik Refresh.</div>
              ) : (
                <select
                  value={form.proxmoxValue}
                  onChange={e => setForm(f => ({ ...f, proxmoxValue: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Pilih VM Template --</option>
                  {vmOptions.map(vm => (
                    <option key={vm.vmid} value={vm.vmid}>
                      [{vm.vmid}] {vm.name}{vm.isTemplate ? ' ★ template' : ` (${vm.status})`}
                    </option>
                  ))}
                </select>
              )
            ) : (
              isoOptions.length === 0 ? (
                <div className={`${inputCls} text-muted`}>Tidak ada ISO di Proxmox. Klik Refresh.</div>
              ) : (
                <select
                  value={form.proxmoxValue}
                  onChange={e => setForm(f => ({ ...f, proxmoxValue: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Pilih ISO --</option>
                  {isoOptions.map(iso => (
                    <option key={iso.volid} value={iso.volid}>
                      [{iso.storage}] {iso.name}
                    </option>
                  ))}
                </select>
              )
            )}

            {form.proxmoxValue && (
              <p className="text-xs font-mono text-muted bg-background px-2 py-1 rounded border border-border">
                {form.proxmoxValue}
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-background transition-colors">
              Batal
            </button>
            <button
              onClick={save}
              disabled={!form.name || !form.proxmoxValue}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-colors"
            >
              {editId ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted">Memuat...</div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">Belum ada template. Klik Tambah untuk mulai.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Nama', 'Proxmox Value', 'Tipe', 'OS', 'Urutan', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-background/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{t.name}</p>
                      {t.badge && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-accent/10 text-accent border border-accent/20">
                          {t.badge}
                        </span>
                      )}
                    </div>
                    {t.description && <p className="text-xs text-muted">{t.description}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted max-w-[160px] truncate">{t.proxmoxValue}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      t.templateType === 'clone'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}>{t.templateType ?? 'clone'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{t.osFamily}</td>
                  <td className="px-4 py-3 text-xs text-muted">{t.sortOrder}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(t)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        t.isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      title={t.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        t.isActive ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(t)} className="p-1 text-muted hover:text-primary transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(t.id)} className="p-1 text-muted hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
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
