import { useState } from 'react'
import type { Category, TransactionType } from '../../types'
import { CATEGORY_COLOR_PALETTE } from '../../constants'
import Button from '../common/Button'
import styles from './CategoryForm.module.css'

interface Props {
  initial?: Category
  fixedType?: TransactionType
  submitLabel?: string
  onSubmit: (data: { name: string; type: TransactionType; color: string; icon?: string }) => void
}

export default function CategoryForm({ initial, fixedType, submitLabel = 'Добавить', onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<TransactionType>(initial?.type ?? fixedType ?? 'expense')
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLOR_PALETTE[0])
  const [icon, setIcon] = useState(initial?.icon ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, type, color, icon: icon.trim() || undefined })
    if (!initial) {
      setName('')
      setIcon('')
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Название категории"
          aria-label="Название категории"
        />
        <input
          className={`${styles.input} ${styles.iconInput}`}
          value={icon}
          onChange={e => setIcon(e.target.value)}
          placeholder="🙂"
          aria-label="Иконка"
          maxLength={4}
        />
      </div>
      {!fixedType && !initial && (
        <select
          className={styles.select}
          value={type}
          onChange={e => setType(e.target.value as TransactionType)}
          aria-label="Тип категории"
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
        </select>
      )}
      <div className={styles.swatches}>
        {CATEGORY_COLOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            className={`${styles.swatch} ${color === c ? styles.swatchSelected : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Цвет ${c}`}
          />
        ))}
      </div>
      <Button type="submit" size="sm" disabled={!name.trim()}>
        {submitLabel}
      </Button>
    </form>
  )
}
