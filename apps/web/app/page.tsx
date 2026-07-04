import Link from 'next/link'
import { Server, Shield, Zap, Globe, ArrowRight } from 'lucide-react'
import { LandingNavbar } from '@/components/layout/landing-navbar'
import { PricingSection } from '@/components/landing/pricing-section'

const features = [
  {
    icon: Zap,
    title: 'Deploy dalam 60 Detik',
    desc: 'VM siap pakai dalam hitungan detik. Pilih paket, pilih OS, set password — selesai.',
  },
  {
    icon: Server,
    title: 'Berbasis Proxmox VE',
    desc: 'Infrastruktur enterprise-grade dengan KVM virtualization. Performa bare-metal, harga terjangkau.',
  },
  {
    icon: Shield,
    title: 'Bayar yang Dipakai',
    desc: 'Billing per jam, prepaid. Tidak ada kontrak, tidak ada biaya tersembunyi. Top-up kapan saja.',
  },
  {
    icon: Globe,
    title: 'NAT & Public IP',
    desc: 'Pilih VM NAT untuk proyek personal atau VM dengan IP publik dedicated untuk produksi.',
  },
]


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-primary">
      <LandingNavbar />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-accent/10 text-accent font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Self-service VPS berbasis Proxmox
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
          Cloud VPS Indonesia<br />
          <span className="text-accent">Murah, Cepat, Transparan</span>
        </h1>
        <p className="text-lg text-muted max-w-2xl mx-auto mb-8">
          Deploy VM Linux dalam 60 detik. Bayar per jam, tidak ada kontrak.
          Infrastruktur KVM enterprise-grade untuk developer dan bisnis.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/register"
            className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:opacity-90 transition-colors">
            Mulai Sekarang <ArrowRight size={16} />
          </Link>
          <Link href="#pricing"
            className="px-6 py-3 border border-border rounded-xl font-medium hover:bg-card transition-colors">
            Lihat Harga
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-xl p-6 flex gap-4">
              <div className="p-2.5 rounded-lg bg-accent/10 shrink-0 h-fit">
                <Icon size={18} className="text-accent" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">Harga Transparan</h2>
          <p className="text-muted">Bayar per jam. Suspend kapan saja. Tidak ada biaya minimum.</p>
        </div>
        <PricingSection />
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="bg-accent rounded-2xl p-10 text-center text-white">
          <h2 className="text-2xl font-bold mb-3">Siap deploy VM pertama kamu?</h2>
          <p className="text-white/80 mb-6">Daftar gratis, top-up saldo, dan VM kamu siap dalam 60 detik.</p>
          <Link href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-accent font-semibold rounded-xl hover:bg-white/90 transition-colors">
            Daftar Sekarang <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted">
          <p>© {new Date().getFullYear()} NOVA. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-primary transition-colors">Masuk</Link>
            <Link href="/register" className="hover:text-primary transition-colors">Daftar</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
