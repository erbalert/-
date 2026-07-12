import type { ReactNode } from 'react'
import styles from './Field.module.css'

interface Props {
  label?: string
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
}

export default function Field({ label, hint, error, htmlFor, children }: Props) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  )
}
