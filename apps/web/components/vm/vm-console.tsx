'use client'
import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'

export function VmConsole({ vmId }: { vmId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let rfb: any
    async function startConsole() {
      try {
        const { data } = await api.post(`/vms/${vmId}/console`)
        const { ticket, port } = data
        const wsUrl = `wss://${process.env.NEXT_PUBLIC_PROXMOX_HOST ?? 'localhost'}:${port}/websockify`

        const { default: RFB } = await import('@novnc/novnc/lib/rfb' as any)
        rfb = new RFB(containerRef.current!, wsUrl, {
          credentials: { password: ticket },
        })
        rfb.scaleViewport = true
        rfb.resizeSession = true
        setLoading(false)
      } catch (e: any) {
        setError(e.message || 'Gagal membuka console')
        setLoading(false)
      }
    }

    startConsole()
    return () => { try { rfb?.disconnect() } catch {} }
  }, [vmId])

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border" style={{ height: 520 }}>
      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center text-white text-sm">
          Membuka console...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 bg-black flex items-center justify-center text-red-400 text-sm px-4 text-center">
          {error}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full bg-black" />
    </div>
  )
}
