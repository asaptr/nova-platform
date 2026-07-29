'use client'
import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'

type TermState = 'connecting' | 'connected' | 'error'

export function VmTerminal({ vmId, onRetry }: { vmId: string; onRetry?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef      = useRef<any>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const [state, setState] = useState<TermState>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let destroyed = false

    async function start() {
      try {
        await api.post(`/vms/${vmId}/terminal`)
        if (destroyed) return

        const token   = localStorage.getItem('access_token')
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
        const wsBase  = apiBase.replace(/^http/, 'ws').replace('/api/v1', '')
        const params  = new URLSearchParams({ token })
        const wsUrl   = `${wsBase}/api/v1/vms/${vmId}/terminal/ws?${params}`

        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
        ])
        if (destroyed || !containerRef.current) return

        const term = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor:     '#58a6ff',
            selectionBackground: '#388bfd33',
          },
          scrollback: 5000,
          allowProposedApi: true,
        })
        const fitAddon   = new FitAddon()
        const linksAddon = new WebLinksAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(linksAddon)
        term.open(containerRef.current)
        fitAddon.fit()
        term.focus()
        termRef.current = { term, fitAddon }

        const enc = new TextEncoder()
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          if (!destroyed) {
            setState('connected')
            ws.send(enc.encode(`\x01${term.cols}:${term.rows}:`))
          }
        }

        ws.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(e.data))
          } else {
            term.write(e.data)
          }
        }

        ws.onclose = (e) => {
          if (!destroyed) {
            const msg = e.code === 1006 || e.code === 1011
              ? 'VM ini belum mendukung terminal. Butuh serial console (serial0: socket) — hubungi admin atau gunakan tab VGA (noVNC).'
              : 'Koneksi terminal terputus.'
            setError(msg)
            setState('error')
          }
        }

        ws.onerror = () => {
          if (!destroyed) {
            setError('Gagal terhubung ke terminal. VM mungkin belum mendukung serial console — coba tab VGA (noVNC).')
            setState('error')
          }
        }

        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(enc.encode(data))
        })

        term.onResize(({ cols, rows }) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(enc.encode(`\x01${cols}:${rows}:`))
        })

        // Handle container resize
        const observer = new ResizeObserver(() => fitAddon.fit())
        if (containerRef.current) observer.observe(containerRef.current)

        return () => observer.disconnect()
      } catch (e: any) {
        if (!destroyed) { setError(e.message || 'Gagal membuka terminal'); setState('error') }
      }
    }

    start()

    return () => {
      destroyed = true
      wsRef.current?.close()
      termRef.current?.term?.dispose()
    }
  }, [vmId])

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border" style={{ height: 520 }}>
      {state === 'connecting' && (
        <div className="absolute inset-0 bg-[#0d1117] flex items-center justify-center text-[#e6edf3] text-sm z-10">
          Menghubungkan ke terminal...
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 bg-[#0d1117] flex flex-col items-center justify-center gap-3 z-10 px-6">
          <p className="text-red-400 text-sm text-center">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-1.5 text-xs bg-accent text-white rounded-lg hover:opacity-90"
            >
              Coba Lagi
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full bg-[#0d1117] p-1" />
    </div>
  )
}
