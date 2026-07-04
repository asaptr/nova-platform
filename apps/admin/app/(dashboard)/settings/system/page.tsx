'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Save, AlertTriangle, Eye, EyeOff, Globe, Shield, Server, Zap, ExternalLink } from 'lucide-react'

const MASK = '••••••••'

const SUBDOMAINS = ['app', 'admin', 'api', 'status', 'docs', 'changelog']

function Section({ title, icon: Icon, children, onSave, saving }: {
  title: string
  icon: any
  children: React.ReactNode
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-accent" />
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Save size={12} /> {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
      {children}
    </div>
  )
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent transition-colors"
    />
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  const isMasked = value === MASK
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={isMasked ? '(tidak berubah)' : placeholder}
        className="w-full border border-border rounded-lg px-3 py-2 pr-9 text-sm bg-background outline-none focus:border-accent transition-colors"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export default function SystemSettingsPage() {
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    api.get('/admin/settings').then(r => { setCfg(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function val(key: string) { return cfg[key] ?? '' }
  function set(key: string) { return (v: string) => setCfg(prev => ({ ...prev, [key]: v })) }

  async function save(section: string, keys: string[]) {
    setSavingSection(section)
    setMsg(null)
    try {
      const payload: Record<string, string> = {}
      for (const k of keys) payload[k] = cfg[k] ?? ''
      await api.put('/admin/settings', payload)
      setMsg({ text: 'Pengaturan berhasil disimpan', ok: true })
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message ?? 'Gagal menyimpan', ok: false })
    } finally {
      setSavingSection(null)
    }
  }

  const baseDomain = val('domain.base').replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (loading) return <div className="text-sm text-muted">Memuat pengaturan...</div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan Sistem</h1>
        <p className="text-sm text-muted mt-1">Konfigurasi platform NOVA</p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${msg.ok
          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
          : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'}`}>
          {msg.text}
        </div>
      )}

      {/* Branding */}
      <Section title="Branding" icon={Zap} onSave={() => save('brand', ['brand.name', 'brand.tagline', 'brand.logo_url'])} saving={savingSection === 'brand'}>
        {/* NOVA as fixed software badge */}
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <div>
            <p className="text-sm font-semibold">NOVA</p>
            <p className="text-xs text-muted">Node Orchestration &amp; Virtualization Architecture — nama software tidak dapat diubah</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama Brand" note="Nama platform / perusahaan yang muncul di UI.">
            <Input value={val('brand.name')} onChange={set('brand.name')} placeholder="Nama platform Anda" />
          </Field>
          <Field label="Tagline">
            <Input value={val('brand.tagline')} onChange={set('brand.tagline')} placeholder="Slogan platform Anda" />
          </Field>
        </div>
        <Field label="Logo URL" note="URL gambar logo. Kosongkan untuk pakai ikon default.">
          <Input value={val('brand.logo_url')} onChange={set('brand.logo_url')} placeholder="https://..." />
        </Field>
        {val('brand.logo_url') && (
          <img src={val('brand.logo_url')} alt="logo preview" className="h-10 object-contain rounded border border-border" />
        )}
      </Section>

      {/* Domains */}
      <Section title="Domain" icon={Globe} onSave={() => save('domain', ['domain.base'])} saving={savingSection === 'domain'}>
        <Field label="Domain Utama" note="Masukkan domain tanpa subdomain, misalnya: yourdomain.com">
          <Input value={val('domain.base')} onChange={set('domain.base')} placeholder="domain.com" />
        </Field>

        {baseDomain && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Subdomain yang akan digunakan:</p>
            <div className="grid grid-cols-2 gap-2">
              {SUBDOMAINS.map(sub => (
                <div key={sub} className="flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg">
                  <span className="text-xs font-mono text-primary truncate">{sub}.{baseDomain}</span>
                  <a
                    href={`https://${sub}.${baseDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-accent flex-shrink-0"
                  >
                    <ExternalLink size={11} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {!baseDomain && (
          <p className="text-xs text-muted italic">Isi domain utama di atas untuk melihat preview subdomain.</p>
        )}
      </Section>

      {/* Proxmox */}
      <Section title="Infrastructure — Proxmox" icon={Server} onSave={() => save('proxmox', ['proxmox.host', 'proxmox.port', 'proxmox.node', 'proxmox.token_id', 'proxmox.token_secret', 'proxmox.verify_ssl'])} saving={savingSection === 'proxmox'}>
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          Perubahan infrastructure memerlukan restart API server untuk berlaku.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host / IP">
            <Input value={val('proxmox.host')} onChange={set('proxmox.host')} placeholder="10.10.10.250" />
          </Field>
          <Field label="Port">
            <Input value={val('proxmox.port')} onChange={set('proxmox.port')} placeholder="8006" />
          </Field>
          <Field label="Node Name">
            <Input value={val('proxmox.node')} onChange={set('proxmox.node')} placeholder="pve" />
          </Field>
          <Field label="Token ID">
            <Input value={val('proxmox.token_id')} onChange={set('proxmox.token_id')} placeholder="user@pve!tokenname" />
          </Field>
        </div>
        <Field label="Token Secret">
          <SecretInput value={val('proxmox.token_secret')} onChange={set('proxmox.token_secret')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </Field>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="verify_ssl"
            checked={val('proxmox.verify_ssl') === 'true'}
            onChange={e => set('proxmox.verify_ssl')(e.target.checked ? 'true' : 'false')}
            className="rounded"
          />
          <label htmlFor="verify_ssl" className="text-sm">Verify SSL Certificate</label>
        </div>
      </Section>

      {/* MikroTik & NAT */}
      <Section title="Infrastructure — MikroTik & NAT" icon={Shield} onSave={() => save('mikrotik', ['mikrotik.host', 'mikrotik.user', 'mikrotik.pass', 'nat.bridge', 'nat.gateway', 'nat.public_ip'])} saving={savingSection === 'mikrotik'}>
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          Perubahan infrastructure memerlukan restart API server untuk berlaku.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MikroTik Host">
            <Input value={val('mikrotik.host')} onChange={set('mikrotik.host')} placeholder="10.10.10.1" />
          </Field>
          <Field label="MikroTik User">
            <Input value={val('mikrotik.user')} onChange={set('mikrotik.user')} placeholder="nova-api" />
          </Field>
        </div>
        <Field label="MikroTik Password">
          <SecretInput value={val('mikrotik.pass')} onChange={set('mikrotik.pass')} placeholder="password" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NAT Bridge">
            <Input value={val('nat.bridge')} onChange={set('nat.bridge')} placeholder="vmbr1" />
          </Field>
          <Field label="NAT Gateway">
            <Input value={val('nat.gateway')} onChange={set('nat.gateway')} placeholder="10.20.0.1" />
          </Field>
          <Field label="NAT Public IP" note="IP publik server untuk SSH forwarding.">
            <Input value={val('nat.public_ip')} onChange={set('nat.public_ip')} placeholder="1.2.3.4" />
          </Field>
        </div>
      </Section>
    </div>
  )
}
