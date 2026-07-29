import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch(`${API}/brand`, { cache: 'no-store' })
    const brand = await res.json()
    const name = brand?.name || 'NOVA'
    return {
      title: `${name} — Admin Panel`,
      description: `${name} — Panel Operator`,
    }
  } catch {
    return {
      title: 'NOVA — Admin Panel',
      description: 'NOVA — Panel Operator',
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
