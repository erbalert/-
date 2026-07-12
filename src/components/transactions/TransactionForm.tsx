import { useState } from 'react'
import type { Transaction, TransactionType } from '../../types'
import type { NewTransaction } from '../../hooks/useTransactions'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useLoans } from '../../hooks/useLoans'
import { todayIso } from '../../utils/date'
import Button from '../common/Button'
import Field from '../common/Field'
import Icon from '../common/Icon'
import fieldStyles from '../common/Field.module.css'
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
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial && (initial.note || initial.loanId || initial.date !== todayIso()))
  )

  const categories = byType(type)
  const activeLoans = loans.filter(l => l.active)

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType)
    setCategoryId(byType(nextType)[0]?.id ?? '')
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
        <Field label="Сумма">
          <input
            className={`${fieldStyles.control} ${styles.amountInput}`}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            aria-label="Сумма"
            autoFocus
          />
        </Field>
        <Field label="Категория">
          <select
            className={fieldStyles.control}
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
        </Field>
      </div>

      <button type="button" className={styles.disclosure} onClick={() => setShowAdvanced(s => !s)}>
        <span className={`${styles.disclosureIcon} ${showAdvanced ? styles.disclosureOpen : ''}`}>
          <Icon name="chevronRight" size={16} />
        </span>
        Дополнительно
      </button>

      {showAdvanced && (
        <div className={styles.advanced}>
          <div className={styles.row}>
            <Field label="Дата">
              <input
                className={fieldStyles.control}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                aria-label="Дата"
              />
            </Field>
            {accounts.length > 1 && (
              <Field label="Счёт">
                <select
                  className={fieldStyles.control}
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
              </Field>
            )}
          </div>

          {type === 'expense' && activeLoans.length > 0 && (
            <Field label="Привязка к кредиту">
              <select
                className={fieldStyles.control}
                value={loanId}
                onChange={e => setLoanId(e.target.value)}
                aria-label="Кредит"
              >
                <option value="">Без привязки</option>
                {activeLoans.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Комментарий">
            <input
              className={fieldStyles.control}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Необязательно"
              aria-label="Комментарий"
            />
          </Field>
        </div>
      )}

      <Button type="submit" icon="plus" disabled={!amount || Number(amount) <= 0}>
        {submitLabel}
      </Button>
    </form>
  )
}
