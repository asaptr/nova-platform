'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield,
  Zap,
  Network,
  Mail,
  Lock,
  Globe,
  Settings,
  Key,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Server
} from 'lucide-react'
import { ThemeToggle } from '@/components/layout/theme-toggle'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

const STEPS = [
  { id: 'branding', title: 'Branding', desc: 'Identitas & Domain', icon: Globe },
  { id: 'admin', title: 'Admin', desc: 'Akun Superadmin', icon: Lock },
  { id: 'proxmox', title: 'Proxmox', desc: 'Virtualization Node', icon: Server },
  { id: 'network', title: 'MikroTik & NAT', desc: 'Integrasi Network', icon: Network },
  { id: 'optional', title: 'SMTP & Gateway', desc: 'Notifikasi & Midtrans', icon: Mail },
]

export default function SetupWizardPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form State
  const [branding, setBranding] = useState({
    name: 'Nova',
    tagline: 'Node Orchestration & Virtualization Architecture',
    domain_base: 'localhost',
    timezone: 'Asia/Jakarta',
  })

  const [admin, setAdmin] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [proxmox, setProxmox] = useState({
    host: '10.10.10.250',
    port: '8006',
    node: 'pve',
    token_id: 'nova@pve!nova-token',
    token_secret: '',
  })

  const [useNat, setUseNat] = useState(true)
  const [mikrotik, setMikrotik] = useState({
    host: '',
    user: 'nova-api',
    pass: '',
  })

  const [nat, setNat] = useState({
    bridge: 'vmbr1',
    gateway: '10.20.0.1',
    network: '10.20.0.0/24',
    public_ip: '',
    public_bridge: 'vmbr0',
  })

  const [smtp, setSmtp] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    user: '',
    pass: '',
    email_from: 'Nova <noreply@localhost>',
  })

  const [midtrans, setMidtrans] = useState({
    server_key: '',
    client_key: '',
    is_production: false,
  })

  // Check setup status on load
  useEffect(() => {
    fetch(`${API}/setup/status`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.installed) {
          // If already installed, redirect to login
          router.push('/login')
        } else {
          setLoadingStatus(false)
        }
      })
      .catch(() => {
        // Fallback: allow setup if API fails to reply but assume not installed
        setLoadingStatus(false)
      })
  }, [router])

  const next = () => {
    // Basic validations per step
    setError(null)
    if (currentStep === 0) {
      if (!branding.name.trim() || !branding.domain_base.trim()) {
        setError('Nama brand dan domain base wajib diisi.')
        return
      }
    } else if (currentStep === 1) {
      if (!admin.email.trim() || !admin.password) {
        setError('Email dan password wajib diisi.')
        return
      }
      if (admin.password.length < 8) {
        setError('Password minimal 8 karakter.')
        return
      }
      if (admin.password !== admin.confirmPassword) {
        setError('Konfirmasi password tidak cocok.')
        return
      }
    } else if (currentStep === 2) {
      if (!proxmox.host.trim() || !proxmox.node.trim() || !proxmox.token_id.trim() || !proxmox.token_secret.trim()) {
        setError('Semua kolom konfigurasi Proxmox wajib diisi.')
        return
      }
    } else if (currentStep === 3 && useNat) {
      if (!mikrotik.host.trim() || !mikrotik.user.trim() || !mikrotik.pass.trim()) {
        setError('Konfigurasi API MikroTik wajib diisi jika NAT diaktifkan.')
        return
      }
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const prev = () => {
    setError(null)
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  const install = async () => {
    setError(null)
    setInstalling(true)

    const payload = {
      branding,
      admin: { email: admin.email, password: admin.password },
      proxmox,
      ...(useNat ? { mikrotik } : {}),
      nat: {
        ...nat,
        ...(useNat ? {} : { bridge: '', gateway: '', network: '', public_ip: '' })
      },
      smtp: smtp.user ? smtp : undefined,
      midtrans: midtrans.server_key ? midtrans : undefined,
    }

    try {
      const res = await fetch(`${API}/setup/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Gagal melakukan instalasi.')
      }

      setSuccess(true)
    } catch (e: any) {
      setError(e.message || 'Koneksi ke server gagal.')
    } finally {
      setInstalling(false)
    }
  }

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-primary">
        <Loader2 size={32} className="animate-spin text-accent mb-4" />
        <p className="text-sm text-muted">Memeriksa status instalasi Nova...</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-8 space-y-6 text-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-green-400 to-emerald-500" />
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-2">
            <Check size={36} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Instalasi Berhasil!</h1>
          <p className="text-muted text-sm leading-relaxed">
            Nova Platform telah berhasil diinstal dan dikonfigurasi. Akun superadmin Anda telah siap digunakan.
          </p>
          <div className="bg-background border border-border rounded-xl p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Domain Base:</span>
              <span className="font-mono font-medium">{branding.domain_base}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Email Admin:</span>
              <span className="font-mono font-medium">{admin.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Brand Name:</span>
              <span className="font-medium">{branding.name}</span>
            </div>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all shadow-md shadow-emerald-600/10"
          >
            Masuk ke Panel Admin
          </button>
        </div>
      </div>
    )
  }

  const StepIcon = STEPS[currentStep].icon

  return (
    <div className="min-h-screen bg-background text-primary flex flex-col justify-between py-10 px-4 select-none relative">
      <div className="fixed top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="max-w-4xl w-full mx-auto space-y-8 flex-1 flex flex-col justify-center">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-medium text-xs">
            <Zap size={12} className="animate-pulse" />
            Nova Platform Setup Wizard
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Instalasi Nova
          </h1>
          <p className="text-sm text-muted">
            Konfigurasikan instance Nova baru Anda dalam beberapa langkah mudah.
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto px-4">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />
          {STEPS.map((step, idx) => {
            const Icon = step.icon
            const isCompleted = idx < currentStep
            const isActive = idx === currentStep
            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isActive
                      ? 'bg-accent text-white scale-110 shadow-lg shadow-accent/25'
                      : 'bg-card border-2 border-border text-muted hover:border-accent/40'
                  }`}
                >
                  {isCompleted ? <Check size={18} /> : <Icon size={18} />}
                </div>
                <span className="hidden sm:block text-[10px] font-medium text-muted mt-2 absolute -bottom-6 w-24 text-center">
                  {step.title}
                </span>
              </div>
            )
          })}
        </div>

        {/* Wizard Card container */}
        <div className="bg-card border border-border rounded-2xl shadow-xl p-6 md:p-8 max-w-2xl w-full mx-auto relative overflow-hidden transition-all mt-6">
          <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
            <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
              <StepIcon size={22} />
            </div>
            <div>
              <h2 className="font-bold text-lg">{STEPS[currentStep].title}</h2>
              <p className="text-xs text-muted">{STEPS[currentStep].desc}</p>
            </div>
          </div>

          {/* Form Fields Switcher */}
          <div className="space-y-4 min-h-[280px]">
            {/* STEP 0: BRANDING */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Nama Brand</label>
                    <input
                      type="text"
                      value={branding.name}
                      onChange={(e) => setBranding({ ...branding, name: e.target.value })}
                      placeholder="Contoh: Langit Node"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Domain Utama (Base Domain)</label>
                    <input
                      type="text"
                      value={branding.domain_base}
                      onChange={(e) => setBranding({ ...branding, domain_base: e.target.value })}
                      placeholder="Contoh: langitnode.com"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Tagline / Slogan</label>
                  <input
                    type="text"
                    value={branding.tagline}
                    onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                    placeholder="Slogan atau deskripsi singkat platform"
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Timezone</label>
                  <select
                    value={branding.timezone}
                    onChange={(e) => setBranding({ ...branding, timezone: e.target.value })}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                    <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                    <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
            )}

            {/* STEP 1: ADMIN */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Email Superadmin</label>
                  <input
                    type="email"
                    value={admin.email}
                    onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                    placeholder="admin@domain.com"
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                  />
                  <p className="text-xs text-muted">Akun ini digunakan pertama kali untuk mengelola seluruh sistem Nova.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Password</label>
                    <input
                      type="password"
                      value={admin.password}
                      onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Ulangi Password</label>
                    <input
                      type="password"
                      value={admin.confirmPassword}
                      onChange={(e) => setAdmin({ ...admin, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: PROXMOX */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-semibold">Proxmox Host / IP</label>
                    <input
                      type="text"
                      value={proxmox.host}
                      onChange={(e) => setProxmox({ ...proxmox, host: e.target.value })}
                      placeholder="https://10.10.10.250"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Port API</label>
                    <input
                      type="text"
                      value={proxmox.port}
                      onChange={(e) => setProxmox({ ...proxmox, port: e.target.value })}
                      placeholder="8006"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Node Name</label>
                    <input
                      type="text"
                      value={proxmox.node}
                      onChange={(e) => setProxmox({ ...proxmox, node: e.target.value })}
                      placeholder="Contoh: pve"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">API Token ID</label>
                    <input
                      type="text"
                      value={proxmox.token_id}
                      onChange={(e) => setProxmox({ ...proxmox, token_id: e.target.value })}
                      placeholder="nova@pve!nova-token"
                      className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">API Token Secret</label>
                  <input
                    type="password"
                    value={proxmox.token_secret}
                    onChange={(e) => setProxmox({ ...proxmox, token_secret: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: NETWORK */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-accent/5 border border-border rounded-xl p-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-sm">Gunakan NAT Networking (MikroTik)</h3>
                    <p className="text-xs text-muted">Aktifkan jika VM menyewa menggunakan subnet IP Privat dengan port forwarding.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseNat(!useNat)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      useNat ? 'bg-accent' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        useNat ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {useNat && (
                  <div className="space-y-4 border border-border rounded-xl p-4 bg-card">
                    <h3 className="font-semibold text-sm text-accent">Setelan MikroTik API</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">Host / IP MikroTik</label>
                        <input
                          type="text"
                          value={mikrotik.host}
                          onChange={(e) => setMikrotik({ ...mikrotik, host: e.target.value })}
                          placeholder="10.10.10.1"
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">User API</label>
                        <input
                          type="text"
                          value={mikrotik.user}
                          onChange={(e) => setMikrotik({ ...mikrotik, user: e.target.value })}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">Password API</label>
                        <input
                          type="password"
                          value={mikrotik.pass}
                          onChange={(e) => setMikrotik({ ...mikrotik, pass: e.target.value })}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    <h3 className="font-semibold text-sm text-accent border-t border-border pt-3">Setelan Subnet NAT</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">Bridge interface</label>
                        <input
                          type="text"
                          value={nat.bridge}
                          onChange={(e) => setNat({ ...nat, bridge: e.target.value })}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">Subnet Network</label>
                        <input
                          type="text"
                          value={nat.network}
                          onChange={(e) => setNat({ ...nat, network: e.target.value })}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted">Gateway Subnet</label>
                        <input
                          type="text"
                          value={nat.gateway}
                          onChange={(e) => setNat({ ...nat, gateway: e.target.value })}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">IP Publik Forwarding (LXC/Baremetal)</label>
                      <input
                        type="text"
                        value={nat.public_ip}
                        onChange={(e) => setNat({ ...nat, public_ip: e.target.value })}
                        placeholder="IP publik yang diarahkan ke SSH port forwarding"
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Public Bridge (Non-NAT IP Publik Dedicated)</label>
                  <input
                    type="text"
                    value={nat.public_bridge}
                    onChange={(e) => setNat({ ...nat, public_bridge: e.target.value })}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-background outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: SMTP & GATEWAY */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="bg-accent/5 border border-border rounded-xl p-4 space-y-4">
                  <h3 className="font-semibold text-sm">SMTP Mailer (Opsional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-bold text-muted">SMTP Host</label>
                      <input
                        type="text"
                        value={smtp.host}
                        onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">SMTP Port</label>
                      <input
                        type="text"
                        value={smtp.port}
                        onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">SMTP Username / Email</label>
                      <input
                        type="text"
                        value={smtp.user}
                        onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                        placeholder="Contoh: noreply@gmail.com"
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">SMTP Password</label>
                      <input
                        type="password"
                        value={smtp.pass}
                        onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
                        placeholder="Password aplikasi mailer"
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted">Email Pengirim (Sender Name & Email)</label>
                    <input
                      type="text"
                      value={smtp.email_from}
                      onChange={(e) => setSmtp({ ...smtp, email_from: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="bg-accent/5 border border-border rounded-xl p-4 space-y-4">
                  <h3 className="font-semibold text-sm">Midtrans Payment (Opsional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">Server Key</label>
                      <input
                        type="text"
                        value={midtrans.server_key}
                        onChange={(e) => setMidtrans({ ...midtrans, server_key: e.target.value })}
                        placeholder="SB-Mid-server-..."
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted">Client Key</label>
                      <input
                        type="text"
                        value={midtrans.client_key}
                        onChange={(e) => setMidtrans({ ...midtrans, client_key: e.target.value })}
                        placeholder="SB-Mid-client-..."
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Alert Error */}
          {error && (
            <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-border pt-5 mt-6">
            <button
              onClick={prev}
              disabled={currentStep === 0 || installing}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} /> Sebelumnya
            </button>

            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={next}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:opacity-90 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Lanjutkan <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={install}
                disabled={installing}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-600/10"
              >
                {installing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Menginstal...
                  </>
                ) : (
                  <>
                    Selesaikan Instalasi <Check size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-muted-foreground mt-8">
        &copy; {new Date().getFullYear()} {branding.name} · All rights reserved. Powered by Nova Platform.
      </div>
    </div>
  )
}
