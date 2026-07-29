'use client'
import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { VmTerminal } from './vm-terminal'

type ConsoleState = 'connecting' | 'connected' | 'error'
type Tab = 'vnc' | 'terminal'

function VncPanel({ vmId }: { vmId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<any>(null)
  const [state, setState] = useState<ConsoleState>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const abort = new AbortController()

    function disconnect() {
      try { rfbRef.current?.disconnect() } catch {}
      rfbRef.current = null
    }

    window.addEventListener('pagehide', disconnect)

    async function startConsole() {
      try {
        const token = localStorage.getItem('access_token')
        if (!token) throw new Error('Tidak ada sesi login')

        const { data } = await api.post(`/vms/${vmId}/console`, {}, { signal: abort.signal })
        if (abort.signal.aborted || !containerRef.current) return

        const { ticket, port, node, vmid } = data
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
        const wsBase = apiBase.replace(/^http/, 'ws').replace('/api/v1', '')
        const params = new URLSearchParams({ token, vncTicket: ticket, vncPort: String(port), node, vmid: String(vmid) })
        const wsUrl = `${wsBase}/api/v1/vms/${vmId}/console/ws?${params}`

        const { default: RFB } = await import('@novnc/novnc')
        if (abort.signal.aborted || !containerRef.current) return

        const rfb = new RFB(containerRef.current, wsUrl, { credentials: { password: ticket } })
        rfb.scaleViewport = true
        rfbRef.current = rfb

        rfb.addEventListener('connect',         () => { if (!abort.signal.aborted) setState('connected') })
        rfb.addEventListener('disconnect',      (e: any) => { if (!abort.signal.aborted) { setError(e.detail?.reason ?? 'koneksi terputus'); setState('error') } })
        rfb.addEventListener('securityfailure', (e: any) => { if (!abort.signal.aborted) { setError(`Auth gagal: ${e.detail?.reason ?? ''}`); setState('error') } })
        rfb.addEventListener('credentialsrequired', () => rfb.sendCredentials({ password: ticket }))
      } catch (e: any) {
        if (!abort.signal.aborted) { setError(e.message || 'Gagal membuka console'); setState('error') }
      }
    }

    startConsole()
    return () => {
      abort.abort()
      window.removeEventListener('pagehide', disconnect)
      disconnect()
    }
  }, [vmId])

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border" style={{ height: 520 }}>
      {state === 'connecting' && (
        <div className="absolute inset-0 bg-black flex items-center justify-center text-white text-sm z-10">
          Menghubungkan ke console...
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 bg-black flex items-center justify-center text-red-400 text-sm px-4 text-center z-10">
          {error}
        </div>
      )}
      {state === 'connected' && (
        <div className="absolute top-2 right-2 text-xs text-green-400 bg-black/60 px-2 py-0.5 rounded z-10 pointer-events-none">
          Connected
        </div>
      )}
      <div ref={containerRef} className="w-full h-full bg-black" />
    </div>
  )
}

export function VmConsole({ vmId, initialTab = 'vnc', onRetry }: {
  vmId: string
  initialTab?: Tab
  onRetry?: () => void
}) {
  return (
    <>
      {initialTab === 'vnc'      && <VncPanel vmId={vmId} />}
      {initialTab === 'terminal' && <VmTerminal vmId={vmId} onRetry={onRetry} />}
    </>
  )
}
