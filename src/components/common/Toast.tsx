import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './icons'
import styles from './Toast.module.css'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ShowOptions {
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

interface ToastApi {
  success: (message: string, options?: ShowOptions) => void
  error: (message: string, options?: ShowOptions) => void
  info: (message: string, options?: ShowOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const ICONS: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'sparkles',
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string, options?: ShowOptions) => {
      const id = crypto.randomUUID()
      setToasts(prev => [...prev, { id, kind, message, actionLabel: options?.actionLabel, onAction: options?.onAction }])
      timers.current[id] = setTimeout(() => dismiss(id), options?.duration ?? 4000)
    },
    [dismiss]
  )

  const api: ToastApi = {
    success: (m, o) => show('success', m, o),
    error: (m, o) => show('error', m, o),
    info: (m, o) => show('info', m, o),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.container} role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
            <span className={styles.iconWrap}>
              <Icon name={ICONS[t.kind]} size={16} />
            </span>
            <span className={styles.message}>{t.message}</span>
            {t.actionLabel && (
              <button
                className={styles.action}
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
