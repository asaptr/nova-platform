'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import api from '@/lib/api'
import type { Vm, VmStatus } from '@nova/types'

const POLL_STATUSES: VmStatus[] = ['pending', 'provisioning', 'running', 'stopped', 'suspended', 'starting', 'stopping', 'rebooting']

export function useVmStatus(vmId: string, intervalMs = 4000) {
  const [vm, setVm] = useState<Vm | null>(null)
  const [loading, setLoading] = useState(true)
  const prevStatusRef = useRef<VmStatus | null>(null)
  const onTransitionRef = useRef<((from: VmStatus, to: VmStatus) => void) | null>(null)

  const refetch = useCallback(async () => {
    try {
      const { data } = await api.get(`/vms/${vmId}`)
      setVm(prev => {
        const newStatus: VmStatus = data.status
        if (prev && prev.status !== newStatus && onTransitionRef.current) {
          onTransitionRef.current(prev.status, newStatus)
        }
        return data
      })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [vmId])

  useEffect(() => {
    refetch()
    const id = setInterval(() => {
      if (vm && !POLL_STATUSES.includes(vm.status as VmStatus)) return
      refetch()
    }, intervalMs)
    return () => clearInterval(id)
  }, [refetch, intervalMs, vm?.status])

  const onTransition = useCallback((fn: (from: VmStatus, to: VmStatus) => void) => {
    onTransitionRef.current = fn
  }, [])

  return { vm, loading, refetch, onTransition }
}
