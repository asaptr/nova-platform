'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

export function useBalance() {
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  async function refetch() {
    try {
      const { data } = await api.get('/users/me/balance')
      setBalance(Number(data.balance))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refetch() }, [])

  return { balance, loading, refetch }
}
