'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { formatRupiah } from '@/lib/utils'

const PRESETS = [25000, 50000, 100000, 200000, 500000]

export function TopupForm() {
  const [amount, setAmount] = useState<number>(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (amount < 10000) { setError('Minimal topup Rp 10.000'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/payment/topup', { amount })
      // Redirect ke Midtrans payment page
      if (data.paymentData?.redirect_url) {
        window.location.href = data.paymentData.redirect_url
      } else {
        alert(`Order ID: ${data.orderId}\nSilahkan selesaikan pembayaran.`)
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted mb-3">Pilih nominal</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                amount === p
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:border-accent/50'
              }`}
            >
              {formatRupiah(p)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-muted block mb-1.5">Atau masukkan nominal lain</label>
        <div className="flex items-center gap-2 border border-border rounded-lg px-3 bg-card">
          <span className="text-muted text-sm">Rp</span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            className="flex-1 py-2 bg-transparent text-sm outline-none"
            placeholder="10000"
            min={10000}
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full bg-accent text-white font-medium py-2.5 rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
      >
        {loading ? 'Memproses...' : `Topup ${formatRupiah(amount)}`}
      </button>
    </div>
  )
}
