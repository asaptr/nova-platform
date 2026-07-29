'use client'
import { useEffect, useState } from 'react'

interface Brand {
  name: string
  tagline: string
  logoUrl: string
  timezone: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>({ name: '', tagline: '', logoUrl: '', timezone: 'Asia/Jakarta' })

  useEffect(() => {
    fetch(`${API}/brand`)
      .then(r => r.json())
      .then(d => setBrand({
        name: d.name ?? '',
        tagline: d.tagline ?? '',
        logoUrl: d.logoUrl ?? '',
        timezone: d.timezone ?? 'Asia/Jakarta',
      }))
      .catch(() => {})
  }, [])

  return brand
}
