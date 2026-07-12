import { useState } from 'react'
import { useCategories } from '../../hooks/useCategories'
import { useBudgets } from '../../hooks/useBudgets'
import Button from '../common/Button'
import styles from './BudgetForm.module.css'

export default function BudgetForm() {
  const { byType } = useCategories()
  const { budgets, addBudget } = useBudgets()

  const budgetedIds = new Set(budgets.map(b => b.categoryId))
  const available = byType('expense').filter(c => !budgetedIds.has(c.id))

  const [categoryId, setCategoryId] = useState(available[0]?.id ?? '')
  const [limit, setLimit] = useState('')

  if (available.length === 0) {
    return <p className={styles.hint}>Для всех категорий расходов уже заданы бюджеты.</p>
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = Number(limit)
    if (!categoryId || !parsed || parsed <= 0) return
    addBudget(categoryId, parsed)
    setLimit('')
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <select
        className={styles.select}
        value={categoryId}
        onChange={e => setCategoryId(e.target.value)}
        aria-label="Категория"
      >
        {available.map(c => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ` : ''}
            {c.name}
          </option>
        ))}
      </select>
      <input
        className={styles.input}
        type="number"
        min="0"
        step="0.01"
        value={limit}
        onChange={e => setLimit(e.target.value)}
        placeholder="Лимит в месяц"
        aria-label="Лимит в месяц"
      />
      <Button type="submit" disabled={!limit || Number(limit) <= 0}>
        Добавить
      </Button>
    </form>
  )
}
