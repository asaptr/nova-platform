'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import Link from 'next/link'

function VerifyEmailContent() {
  const params = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); setMsg('Token tidak ditemukan.'); return }

    api.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/login'), 3000)
      })
      .catch(e => {
        setStatus('error')
        setMsg(e.response?.data?.message ?? 'Token tidak valid atau sudah kedaluwarsa.')
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="bg-card border border-border rounded-2xl p-10 max-w-sm w-full text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader size={40} className="text-accent animate-spin mx-auto" />
            <p className="font-medium">Memverifikasi email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={40} className="text-green-500 mx-auto" />
            <p className="font-semibold text-lg">Email Terverifikasi!</p>
            <p className="text-sm text-muted">Akun kamu sudah aktif. Mengalihkan ke halaman login...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={40} className="text-red-500 mx-auto" />
            <p className="font-semibold text-lg">Verifikasi Gagal</p>
            <p className="text-sm text-muted">{msg}</p>
            <Link href="/login" className="block mt-2 text-sm text-accent hover:underline">
              Kembali ke login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader size={40} className="text-accent animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
