'use client'
import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { Save, AlertTriangle, Eye, EyeOff, Globe, Shield, Server, Zap, ExternalLink, Network, Plus, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

// ── CIDR helpers (client-side) ─────────────────────────────────────────────
function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return 0
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}
function numToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}
function numToMask(prefix: number): string {
  return numToIp(prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0)
}
function calcCidr(cidr: string) {
  const [ipPart, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr ?? '')
  if (!ipPart || isNaN(prefix) || prefix < 8 || prefix > 30) return null
  const totalHosts = Math.pow(2, 32 - prefix)
  const mask = (~(totalHosts - 1)) >>> 0
  const networkNum = (ipToNum(ipPart) & mask) >>> 0
  const broadcastNum = (networkNum + totalHosts - 1) >>> 0
  return {
    network:   numToIp(networkNum),
    broadcast: numToIp(broadcastNum),
    gateway:   numToIp(networkNum + 1),
    netmask:   numToMask(prefix),
    prefix,
    usable:    totalHosts - 2,
    firstHost: numToIp(networkNum + 2),
    lastHost:  numToIp(broadcastNum - 1),
  }
}

const DNS_PRESETS = [
  { label: 'Cloudflare (1.1.1.1)', primary: '1.1.1.1', secondary: '1.0.0.1' },
  { label: 'Google (8.8.8.8)', primary: '8.8.8.8', secondary: '8.4.4.8' },
  { label: 'Quad9 (9.9.9.9)', primary: '9.9.9.9', secondary: '149.112.112.112' },
  { label: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220' },
  { label: 'Custom', primary: '', secondary: '' },
]
// ──────────────────────────────────────────────────────────────────────────────

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
  const { toast } = useToast()
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<string | null>(null)

  // Network state
  const [bridges, setBridges] = useState<any[]>([])
  const [bridgesLoading, setBridgesLoading] = useState(false)
  const [dnsPreset, setDnsPreset] = useState('Cloudflare (1.1.1.1)')
  const [newBridge, setNewBridge] = useState({ iface: '', bridgePorts: '', address: '', netmask: '' })
  const [showNewBridge, setShowNewBridge] = useState(false)

  const fetchBridges = useCallback(async () => {
    setBridgesLoading(true)
    try {
      const { data } = await api.get('/admin/network/bridges')
      setBridges(data)
    } catch { setBridges([]) }
    finally { setBridgesLoading(false) }
  }, [])

  useEffect(() => {
    api.get('/admin/settings').then(r => {
      setCfg(r.data)
      setLoading(false)
      // Set DNS preset based on loaded value
      const p = r.data['nat.dns_primary']
      if (p) {
        const found = DNS_PRESETS.find(d => d.primary === p)
        if (found) setDnsPreset(found.label)
        else setDnsPreset('Custom')
      }
    }).catch(() => setLoading(false))
    fetchBridges()
  }, [fetchBridges])

  function val(key: string) { return cfg[key] ?? '' }
  function set(key: string) { return (v: string) => setCfg(prev => ({ ...prev, [key]: v })) }

  async function save(section: string, keys: string[]) {
    setSavingSection(section)
    try {
      const payload: Record<string, string> = {}
      for (const k of keys) {
        const v = cfg[k] ?? ''
        if (v !== '') payload[k] = v
      }
      if (Object.keys(payload).length === 0) {
        toast('Tidak ada nilai yang diisi untuk disimpan', 'warning')
        setSavingSection(null)
        return
      }
      await api.put('/admin/settings', payload)

      if (section === 'network' && (payload['nat.network'] || payload['nat.bridge'])) {
        try {
          const { data } = await api.post('/admin/network/apply-gateway')
          toast(`Tersimpan — ${data.message}`, 'success')
        } catch (e: any) {
          toast(`Tersimpan, tapi apply gateway gagal: ${e.response?.data?.message ?? e.message}`, 'warning')
        }
        return
      }

      toast('Pengaturan berhasil disimpan', 'success')
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Gagal menyimpan', 'error')
    } finally {
      setSavingSection(null)
    }
  }

  async function createBridge() {
    try {
      const { data } = await api.post('/admin/network/bridges', newBridge)
      toast(data.message, 'success')
      setNewBridge({ iface: '', bridgePorts: '', address: '', netmask: '' })
      setShowNewBridge(false)
      fetchBridges()
    } catch (e: any) {
      toast(e.response?.data?.message ?? 'Gagal membuat bridge', 'error')
    }
  }

  const baseDomain = val('domain.base').replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (loading) return <div className="text-sm text-muted">Memuat pengaturan...</div>

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan Sistem</h1>
        <p className="text-sm text-muted mt-1">Konfigurasi platform NOVA</p>
      </div>

      {/* Branding */}
      <Section title="Branding" icon={Zap} onSave={() => save('brand', ['brand.name', 'brand.tagline', 'brand.logo_url', 'brand.timezone'])} saving={savingSection === 'brand'}>
        {/* NOVA as fixed software badge */}
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <div>
            <p className="text-sm font-semibold">NOVA</p>
            <p className="text-xs text-muted">Node Orchestration &amp; Virtualization Architecture</p>
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
        <Field label="Timezone" note="Zona waktu yang ditampilkan di seluruh platform (timestamp log, billing, dll).">
          <select
            value={val('brand.timezone') || 'Asia/Jakarta'}
            onChange={e => set('brand.timezone')(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent transition-colors"
          >
            <optgroup label="Asia Tenggara">
              <option value="Asia/Jakarta">Asia/Jakarta — GMT+7 (WIB)</option>
              <option value="Asia/Makassar">Asia/Makassar — GMT+8 (WITA)</option>
              <option value="Asia/Jayapura">Asia/Jayapura — GMT+9 (WIT)</option>
              <option value="Asia/Singapore">Asia/Singapore — GMT+8 (SGT)</option>
              <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur — GMT+8 (MYT)</option>
              <option value="Asia/Bangkok">Asia/Bangkok — GMT+7 (ICT)</option>
              <option value="Asia/Manila">Asia/Manila — GMT+8 (PST)</option>
              <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh — GMT+7 (ICT)</option>
            </optgroup>
            <optgroup label="Asia Timur">
              <option value="Asia/Shanghai">Asia/Shanghai — GMT+8 (CST)</option>
              <option value="Asia/Tokyo">Asia/Tokyo — GMT+9 (JST)</option>
              <option value="Asia/Seoul">Asia/Seoul — GMT+9 (KST)</option>
            </optgroup>
            <optgroup label="Asia Lainnya">
              <option value="Asia/Dubai">Asia/Dubai — GMT+4 (GST)</option>
              <option value="Asia/Kolkata">Asia/Kolkata — GMT+5:30 (IST)</option>
            </optgroup>
            <optgroup label="Eropa">
              <option value="Europe/London">Europe/London — GMT+0/+1</option>
              <option value="Europe/Paris">Europe/Paris — GMT+1/+2</option>
            </optgroup>
            <optgroup label="Amerika">
              <option value="America/New_York">America/New_York — GMT-5/-4</option>
              <option value="America/Los_Angeles">America/Los_Angeles — GMT-8/-7</option>
            </optgroup>
            <option value="UTC">UTC — GMT+0</option>
          </select>
        </Field>
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

      {/* MikroTik */}
      <Section title="Infrastructure — MikroTik" icon={Shield} onSave={() => save('mikrotik', ['mikrotik.host', 'mikrotik.user', 'mikrotik.pass'])} saving={savingSection === 'mikrotik'}>
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
      </Section>

      {/* Network & NAT */}
      <Section title="Network & NAT" icon={Network} onSave={() => save('network', ['nat.network', 'nat.bridge', 'nat.gateway', 'nat.public_ip', 'nat.dns_primary', 'nat.dns_secondary', 'public.bridge'])} saving={savingSection === 'network'}>
        {/* CIDR */}
        {(() => {
          const cidr = val('nat.network') || ''
          const calc = cidr.includes('/') ? calcCidr(cidr) : null
          return (
            <div className="space-y-3">
              <Field label="Network Range (CIDR)" note="Range IP yang digunakan untuk VM NAT. Contoh: 10.20.0.0/20">
                <Input value={val('nat.network')} onChange={set('nat.network')} placeholder="10.20.0.0/24" />
              </Field>
              {calc ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    ['Gateway (auto)', calc.gateway],
                    ['Netmask', calc.netmask],
                    ['Prefix', `/${calc.prefix}`],
                    ['Network', calc.network],
                    ['Broadcast', calc.broadcast],
                    ['Usable IPs', calc.usable.toLocaleString()],
                    ['First Host', calc.firstHost],
                    ['Last Host', calc.lastHost],
                  ].map(([label, v]) => (
                    <div key={label} className="bg-background border border-border rounded-lg px-3 py-2">
                      <p className="text-xs text-muted">{label}</p>
                      <p className="text-sm font-mono font-medium">{v}</p>
                    </div>
                  ))}
                </div>
              ) : cidr ? (
                <p className="text-xs text-red-500">Format CIDR tidak valid. Gunakan format: 10.20.0.0/24</p>
              ) : null}
              {calc && (
                <p className="text-xs text-muted">
                  Gateway akan otomatis dipakai sebagai <code className="font-mono">nat.gateway</code> saat provisioning VM baru.
                  Override manual di bawah jika diperlukan.
                </p>
              )}
            </div>
          )
        })()}

        {/* Bridge */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted">NAT Bridge</label>
            <div className="flex items-center gap-2">
              <button onClick={fetchBridges} className="text-xs text-muted hover:text-primary flex items-center gap-1">
                <RefreshCw size={11} className={bridgesLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button onClick={() => setShowNewBridge(v => !v)} className="text-xs text-accent hover:opacity-80 flex items-center gap-1">
                <Plus size={11} /> Buat Bridge Baru
              </button>
            </div>
          </div>
          <select
            value={val('nat.bridge') || ''}
            onChange={e => set('nat.bridge')(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent transition-colors"
          >
            <option value="">-- Pilih bridge --</option>
            {bridges.map(b => (
              <option key={b.iface} value={b.iface}>
                {b.iface}{b.active ? '' : ' (inactive)'}{b.bridgePorts ? ` — ports: ${b.bridgePorts}` : ' — no ports'}
              </option>
            ))}
            {bridges.length === 0 && !bridgesLoading && (
              <option disabled>Tidak dapat memuat bridge dari Proxmox</option>
            )}
          </select>

          {showNewBridge && (
            <div className="border border-border rounded-xl p-4 space-y-3 bg-background">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">Buat Virtual Bridge Baru</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Bridge" note="Contoh: vmbr2">
                  <Input value={newBridge.iface} onChange={v => setNewBridge(b => ({ ...b, iface: v }))} placeholder="vmbr2" />
                </Field>
                <Field label="Bridge Ports" note="Interface fisik. Kosongkan untuk bridge internal.">
                  <Input value={newBridge.bridgePorts} onChange={v => setNewBridge(b => ({ ...b, bridgePorts: v }))} placeholder="eth1 (opsional)" />
                </Field>
                <Field label="IP Address (opsional)" note="Untuk routing host">
                  <Input value={newBridge.address} onChange={v => setNewBridge(b => ({ ...b, address: v }))} placeholder="10.20.0.1" />
                </Field>
                <Field label="Netmask (opsional)">
                  <Input value={newBridge.netmask} onChange={v => setNewBridge(b => ({ ...b, netmask: v }))} placeholder="255.255.255.0" />
                </Field>
              </div>
              <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={12} />
                Membuat bridge akan langsung di-apply ke Proxmox node. Pastikan tidak mengganggu konektivitas.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createBridge}
                  disabled={!newBridge.iface}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:opacity-90"
                >
                  <Plus size={12} /> Buat & Apply
                </button>
                <button onClick={() => setShowNewBridge(false)} className="px-3 py-1.5 border border-border rounded-lg text-xs">
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Public bridge */}
        <Field label="Public Bridge" note="Bridge untuk VM dengan IP publik langsung.">
          <select
            value={val('public.bridge') || ''}
            onChange={e => set('public.bridge')(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-accent transition-colors"
          >
            <option value="">-- Pilih bridge --</option>
            {bridges.map(b => (
              <option key={b.iface} value={b.iface}>{b.iface}{b.bridgePorts ? ` — ports: ${b.bridgePorts}` : ''}</option>
            ))}
          </select>
        </Field>

        {/* SSH info */}
        <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2.5">
          <Server size={13} className="mt-0.5 shrink-0" />
          <span>
            Saat menyimpan Network & NAT, gateway bridge di Proxmox <b>dan iptables masquerade</b> akan diperbarui otomatis.
            Untuk update iptables, set <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">PROXMOX_SSH_KEY</code> atau <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">PROXMOX_SSH_PASSWORD</code> di <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">.env</code> API.
          </span>
        </div>

        {/* NAT gateway override */}
        <Field label="Gateway Override" note="Kosongkan untuk auto-pakai gateway dari CIDR di atas.">
          <Input value={val('nat.gateway')} onChange={set('nat.gateway')} placeholder={calcCidr(val('nat.network'))?.gateway ?? '10.20.0.1'} />
        </Field>

        {/* Public IP */}
        <Field label="NAT Public IP" note="IP publik server untuk SSH forwarding ke VM.">
          <Input value={val('nat.public_ip')} onChange={set('nat.public_ip')} placeholder="1.2.3.4" />
        </Field>

        {/* DNS */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">DNS Server untuk VM</label>
          <div className="flex flex-wrap gap-2">
            {DNS_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => {
                  setDnsPreset(p.label)
                  if (p.primary) {
                    set('nat.dns_primary')(p.primary)
                    set('nat.dns_secondary')(p.secondary)
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${dnsPreset === p.label
                  ? 'bg-accent text-white border-accent'
                  : 'bg-background border-border text-muted hover:text-primary'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="DNS Primary">
              <Input value={val('nat.dns_primary')} onChange={v => { set('nat.dns_primary')(v); setDnsPreset('Custom') }} placeholder="1.1.1.1" />
            </Field>
            <Field label="DNS Secondary">
              <Input value={val('nat.dns_secondary')} onChange={v => { set('nat.dns_secondary')(v); setDnsPreset('Custom') }} placeholder="1.0.0.1" />
            </Field>
          </div>
        </div>
      </Section>
    </div>
  )
}
