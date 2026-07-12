import { useState } from 'react'
import Button from '../common/Button'
import styles from './AccountForm.module.css'

interface Props {
  initialName?: string
  submitLabel?: string
  onSubmit: (name: string) => void
}

export default function AccountForm({ initialName = '', submitLabel = 'Добавить', onSubmit }: Props) {
  const [name, setName] = useState(initialName)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    if (!initialName) setName('')
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Название счёта, например «Карта»"
        aria-label="Название счёта"
      />
      <Button type="submit" disabled={!name.trim()}>
        {submitLabel}
      </Button>
    </form>
  )
}
