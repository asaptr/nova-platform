'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'

interface Package {
  id: string
  name: string
  vcpu: number
  ramMb: number
  diskGb: number
  bandwidthGb: number
  priceHourly: number
  priceMonthly: number
  ipType: 'nat' | 'public'
}

export function PricingSection() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'}/vms/packages`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPackages(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border border-border rounded-xl p-6 h-64 animate-pulse" />
        ))}
      </div>
    )
  }

  if (packages.length === 0) return null

  const mostPopular = packages.find(p => p.ipType === 'nat' && packages.filter(x => x.ipType === 'nat').indexOf(p) === 1)
    ?? packages[Math.floor(packages.length / 2)]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {packages.map(pkg => {
        const isPopular = pkg.id === mostPopular?.id
        const ramLabel = pkg.ramMb >= 1024 ? `${pkg.ramMb / 1024} GB` : `${pkg.ramMb} MB`
        const specs = [`${pkg.vcpu} vCPU`, `${ramLabel} RAM`, `${pkg.diskGb} GB SSD`]
        return (
          <div
            key={pkg.id}
            className={`bg-card border rounded-xl p-6 relative flex flex-col ${isPopular ? 'border-accent shadow-lg shadow-accent/10' : 'border-border'}`}
          >
            {isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="text-xs px-3 py-1 bg-accent text-white rounded-full font-medium">Populer</span>
              </div>
            )}
            <div className="mb-4">
              <p className="font-semibold">{pkg.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded font-medium mt-1 inline-block ${
                pkg.ipType === 'nat'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
              }`}>
                {pkg.ipType === 'nat' ? 'NAT' : 'Public IP'}
              </span>
            </div>
            <div className="space-y-2 mb-6 flex-1">
              {specs.map(s => (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <CheckCircle size={14} className="text-accent shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
              {pkg.ipType === 'nat' ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle size={14} className="text-accent shrink-0" />
                  <span>SSH port forwarding</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle size={14} className="text-accent shrink-0" />
                  <span>1 IP Publik Dedicated</span>
                </div>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-2xl font-bold">
                {formatRupiah(Number(pkg.priceHourly))}
                <span className="text-sm font-normal text-muted">/jam</span>
              </p>
              <p className="text-xs text-muted mt-0.5">≈ {formatRupiah(Number(pkg.priceMonthly))}/bulan</p>
              <Link
                href="/register"
                className={`block text-center mt-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isPopular ? 'bg-accent text-white hover:opacity-90' : 'border border-border hover:bg-background'
                }`}
              >
                Deploy Sekarang
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
