import { useState } from 'react'
import type { RecurrenceFrequency, TransactionType } from '../types'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useRecurring } from '../hooks/useRecurring'
import { todayIso } from '../utils/date'
import RecurringList from '../components/recurring/RecurringList'
import PageHeader from '../components/layout/PageHeader'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import { useToast } from '../components/common/Toast'
import styles from './RecurringPage.module.css'

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
]

export default function RecurringPage() {
  const { accounts } = useAccounts()
  const { byType } = useCategories()
  const { addRule } = useRecurring()
  const toast = useToast()

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(byType('expense')[0]?.id ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [startDate, setStartDate] = useState(todayIso())
  const [note, setNote] = useState('')

  const categories = byType(type)

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType)
    setCategoryId(byType(nextType)[0]?.id ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!parsedAmount || parsedAmount <= 0 || !accountId || !categoryId) return
    addRule({
      type,
      amount: parsedAmount,
      accountId,
      categoryId,
      frequency,
      startDate,
      note: note.trim() || undefined,
      active: true,
    })
    setAmount('')
    setNote('')
    toast.success('Повторяющаяся операция создана')
  }

  if (accounts.length === 0 || categories.length === 0) {
    return (
      <div>
        <PageHeader title="Повторяющиеся" subtitle="Автоматически создаваемые регулярные операции" />
        <p className={styles.hint}>
          Чтобы добавить повторяющуюся операцию, сначала создайте хотя бы один счёт и категорию.
        </p>
        <RecurringList />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Повторяющиеся" subtitle="Автоматически создаваемые регулярные операции" />
      <Card style={{ marginBottom: 'var(--sp-5)' }}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.typeToggle}>
          <button
            type="button"
            className={`${styles.typeButton} ${type === 'expense' ? styles.typeButtonActiveExpense : ''}`}
            onClick={() => handleTypeChange('expense')}
          >
            Расход
          </button>
          <button
            type="button"
            className={`${styles.typeButton} ${type === 'income' ? styles.typeButtonActiveIncome : ''}`}
            onClick={() => handleTypeChange('income')}
          >
            Доход
          </button>
        </div>

        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Сумма"
            aria-label="Сумма"
          />
          <select
            className={styles.select}
            value={frequency}
            onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
            aria-label="Частота"
          >
            {FREQUENCIES.map(f => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            aria-label="Дата начала"
          />
        </div>

        <div className={styles.row}>
          <select className={styles.select} value={accountId} onChange={e => setAccountId(e.target.value)} aria-label="Счёт">
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className={styles.select} value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Категория">
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <input
          className={styles.input}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Комментарий (необязательно)"
          aria-label="Комментарий"
        />

        <Button type="submit" icon="plus" disabled={!amount || Number(amount) <= 0}>
          Добавить повторяющуюся операцию
        </Button>
      </form>
      </Card>
      <RecurringList />
    </div>
  )
}
