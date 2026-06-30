'use client'
import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import type { Vm } from '@langitnode/types'

export function useVmStatus(vmId: string, intervalMs = 5000) {
  const [vm, setVm] = useState<Vm | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const { data } = await api.get(`/vms/${vmId}`)
      setVm(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [vmId])

  useEffect(() => {
    refetch()
    const POLL_STATUSES = ['pending', 'provisioning']
    const id = setInterval(() => {
      if (vm && !POLL_STATUSES.includes(vm.status)) return
      refetch()
    }, intervalMs)
    return () => clearInterval(id)
  }, [refetch, intervalMs, vm?.status])

  return { vm, loading, refetch }
}
