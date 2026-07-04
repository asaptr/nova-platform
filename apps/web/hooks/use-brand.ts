'use client'
import { useEffect, useState } from 'react'

interface Brand {
  name: string
  tagline: string
  logoUrl: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>({ name: '', tagline: '', logoUrl: '' })

  useEffect(() => {
    fetch(`${API}/brand`)
      .then(r => r.json())
      .then(d => setBrand({ name: d.name ?? '', tagline: d.tagline ?? '', logoUrl: d.logoUrl ?? '' }))
      .catch(() => {})
  }, [])

  return brand
}
