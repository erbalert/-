import { useState } from 'react'
import type { LoanPaymentType } from '../../types'
import { useLoans } from '../../hooks/useLoans'
import { todayIso } from '../../utils/date'
import Button from '../common/Button'
import { useToast } from '../common/Toast'
import styles from './LoanForm.module.css'

export default function LoanForm() {
  const { addLoan } = useLoans()
  const toast = useToast()

  const [name, setName] = useState('')
  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [termMonths, setTermMonths] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [paymentType, setPaymentType] = useState<LoanPaymentType>('annuity')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedPrincipal = Number(principal)
    const parsedRate = Number(interestRate)
    const parsedTerm = Number(termMonths)
    if (!name.trim() || !parsedPrincipal || parsedPrincipal <= 0 || parsedRate < 0 || !parsedTerm || parsedTerm <= 0) return

    addLoan({
      name: name.trim(),
      principal: parsedPrincipal,
      interestRate: parsedRate,
      termMonths: parsedTerm,
      startDate,
      paymentType,
      active: true,
    })

    setName('')
    setPrincipal('')
    setInterestRate('')
    setTermMonths('')
    toast.success('Кредит добавлен')
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Название кредита, например «Ипотека»"
        aria-label="Название кредита"
      />
      <div className={styles.row}>
        <input
          className={styles.input}
          type="number"
          min="0"
          step="0.01"
          value={principal}
          onChange={e => setPrincipal(e.target.value)}
          placeholder="Сумма кредита"
          aria-label="Сумма кредита"
        />
        <input
          className={styles.input}
          type="number"
          min="0"
          step="0.01"
          value={interestRate}
          onChange={e => setInterestRate(e.target.value)}
          placeholder="Ставка, % годовых"
          aria-label="Ставка, % годовых"
        />
        <input
          className={styles.input}
          type="number"
          min="1"
          step="1"
          value={termMonths}
          onChange={e => setTermMonths(e.target.value)}
          placeholder="Срок, мес."
          aria-label="Срок, мес."
        />
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          aria-label="Дата выдачи"
        />
        <select
          className={styles.select}
          value={paymentType}
          onChange={e => setPaymentType(e.target.value as LoanPaymentType)}
          aria-label="Тип платежей"
        >
          <option value="annuity">Аннуитетные платежи</option>
          <option value="differentiated">Дифференцированные платежи</option>
        </select>
      </div>
      <Button type="submit" icon="plus" disabled={!name.trim() || !principal || !termMonths}>
        Добавить кредит
      </Button>
    </form>
  )
}
