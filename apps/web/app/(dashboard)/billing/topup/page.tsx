import { TopupForm } from '@/components/billing/topup-form'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function TopupPage() {
  return (
    <div className="max-w-md space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/billing" className="text-muted hover:text-primary"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-bold">Topup Saldo</h1>
          <p className="text-sm text-muted">Isi saldo untuk deploy dan bayar VM.</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <TopupForm />
      </div>
    </div>
  )
}
