import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'error' | 'warning'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  durationMs?: number
}

export interface ToastApi {
  show: (t: ToastInput) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
