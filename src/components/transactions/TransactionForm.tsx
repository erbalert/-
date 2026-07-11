import { useState } from 'react'
import type { Transaction, TransactionType } from '../../types'
import type { NewTransaction } from '../../hooks/useTransactions'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useLoans } from '../../hooks/useLoans'
import { todayIso } from '../../utils/date'
import styles from './TransactionForm.module.css'

interface Props {
  initial?: Transaction
  submitLabel?: string
  onSubmit: (data: NewTransaction) => void
}

export default function TransactionForm({ initial, submitLabel = 'Добавить операцию', onSubmit }: Props) {
  const { accounts } = useAccounts()
  const { byType } = useCategories()
  const { loans } = useLoans()

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? byType(type)[0]?.id ?? '')
  const [date, setDate] = useState(initial?.date ?? todayIso())
  const [note, setNote] = useState(initial?.note ?? '')
  const [loanId, setLoanId] = useState(initial?.loanId ?? '')

  const categories = byType(type)

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType)
    const firstOfType = byType(nextType)[0]
    setCategoryId(firstOfType?.id ?? '')
    if (nextType === 'income') setLoanId('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!parsedAmount || parsedAmount <= 0 || !accountId || !categoryId) return
    onSubmit({
      type,
      amount: parsedAmount,
      accountId,
      categoryId,
      date,
      note: note.trim() || undefined,
      loanId: loanId || undefined,
    })
    if (!initial) {
      setAmount('')
      setNote('')
      setLoanId('')
    }
  }

  if (accounts.length === 0 || categories.length === 0) {
    return (
      <p className={styles.hint}>
        Чтобы добавить операцию, сначала создайте хотя бы один счёт и категорию на странице «Счета и категории».
      </p>
    )
  }

  return (
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
        <input
          className={styles.input}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          aria-label="Дата"
        />
      </div>

      <div className={styles.row}>
        <select
          className={styles.select}
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          aria-label="Счёт"
        >
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          aria-label="Категория"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {type === 'expense' && loans.length > 0 && (
        <select
          className={styles.select}
          value={loanId}
          onChange={e => setLoanId(e.target.value)}
          aria-label="Кредит"
        >
          <option value="">Без привязки к кредиту</option>
          {loans
            .filter(l => l.active)
            .map(l => (
              <option key={l.id} value={l.id}>
                Кредит: {l.name}
              </option>
            ))}
        </select>
      )}

      <input
        className={styles.input}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Комментарий (необязательно)"
        aria-label="Комментарий"
      />

      <button className={styles.submitButton} type="submit" disabled={!amount || Number(amount) <= 0}>
        {submitLabel}
      </button>
    </form>
  )
}
