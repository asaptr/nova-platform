'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning'
interface ToastItem { id: number; message: string; type: ToastType }
interface ToastContextValue { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

const STYLES: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-green-500',  icon: <CheckCircle size={15} className="shrink-0" /> },
  error:   { bg: 'bg-red-500',    icon: <XCircle size={15} className="shrink-0" /> },
  warning: { bg: 'bg-amber-500',  icon: <AlertTriangle size={15} className="shrink-0" /> },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const s = STYLES[t.type]
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 pl-3.5 pr-3 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white pointer-events-auto max-w-sm animate-slide-up ${s.bg}`}
            >
              <span className="mt-0.5">{s.icon}</span>
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="mt-0.5 opacity-70 hover:opacity-100 transition-opacity shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
