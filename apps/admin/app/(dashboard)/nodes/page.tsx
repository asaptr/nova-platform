'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>{pct}%</span>
        <span>{Math.round(value / 1024 / 1024 / 1024 * 10) / 10} / {Math.round(max / 1024 / 1024 / 1024)} GB</span>
      </div>
      <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AdminNodesPage() {
  const [nodes, setNodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await api.get('/admin/nodes')
    setNodes(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Node Health</h1>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-5 h-48 animate-pulse" />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Node Health</h1>
        <button onClick={load} className="text-xs text-accent hover:underline">Refresh</button>
      </div>

      {nodes.length === 0 && (
        <p className="text-muted text-sm">Tidak ada node ditemukan.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {nodes.map(node => {
          const cpuPct = Math.round((node.cpu ?? 0) * 100)
          const ramPct = node.memory ? Math.round((node.memory.used / node.memory.total) * 100) : 0

          return (
            <div key={node.node} className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{node.node}</p>
                  {node.ip && <p className="text-xs text-muted font-mono">{node.ip}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${node.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={`text-xs font-medium ${node.status === 'online' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {node.status ?? 'online'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-background rounded-lg p-2.5">
                  <p className="text-xs text-muted">CPU Core</p>
                  <p className="font-bold text-lg">{node.maxcpu ?? '—'}</p>
                </div>
                <div className="bg-background rounded-lg p-2.5">
                  <p className="text-xs text-muted">RAM Total</p>
                  <p className="font-bold text-lg">{node.memory ? `${Math.round(node.memory.total / 1024 / 1024 / 1024)}GB` : '—'}</p>
                </div>
                <div className="bg-background rounded-lg p-2.5">
                  <p className="text-xs text-muted">VM Count</p>
                  <p className="font-bold text-lg">{node.vmCount ?? '—'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>CPU Usage</span>
                    <span>{cpuPct}%</span>
                  </div>
                  <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cpuPct > 85 ? 'bg-red-500' : cpuPct > 65 ? 'bg-amber-500' : 'bg-blue-500'}`}
                      style={{ width: `${cpuPct}%` }}
                    />
                  </div>
                </div>

                {node.memory && (
                  <div>
                    <p className="text-xs text-muted mb-1">RAM Usage</p>
                    <ProgressBar value={node.memory.used} max={node.memory.total} />
                  </div>
                )}

                {node.rootfs && (
                  <div>
                    <p className="text-xs text-muted mb-1">Storage (rootfs)</p>
                    <ProgressBar value={node.rootfs.used} max={node.rootfs.total} />
                  </div>
                )}
              </div>

              {node.uptime !== undefined && (
                <p className="text-xs text-muted">
                  Uptime: {Math.floor(node.uptime / 86400)}d {Math.floor((node.uptime % 86400) / 3600)}h
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
