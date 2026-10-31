import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import type { ToastApi, ToastInput, ToastTone } from './toastContext'
import { ToastContext } from './toastContext'

interface ToastItem extends ToastInput {
  id: number
}

const icons: Record<ToastTone, ReactNode> = {
  info: <Info size={16} className="text-accent" />,
  success: <CheckCircle2 size={16} className="text-good" />,
  error: <XCircle size={16} className="text-bad" />,
  warning: <AlertTriangle size={16} className="text-warn" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      setItems((xs) => [...xs.slice(-4), { ...t, id }])
      const ms = t.durationMs ?? (t.tone === 'error' ? 7000 : 3500)
      setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ title, description, tone: 'success' }),
      error: (title, description) => show({ title, description, tone: 'error' }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
          {items.map((t) => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-lg',
              )}
              style={{ animation: 'toast-in 160ms ease-out' }}
            >
              <div className="mt-0.5">{icons[t.tone ?? 'info']}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{t.title}</div>
                {t.description && <div className="mt-0.5 text-xs break-words text-fg-muted">{t.description}</div>}
              </div>
              <button className="text-fg-muted hover:text-fg" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
