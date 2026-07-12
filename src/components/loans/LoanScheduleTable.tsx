import type { Loan } from '../../types'
import { buildAmortizationSchedule } from '../../utils/loans'
import { formatDateRu, todayIso } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import styles from './LoanScheduleTable.module.css'

interface Props {
  loan: Loan
}

export default function LoanScheduleTable({ loan }: Props) {
  const schedule = buildAmortizationSchedule(loan)
  const today = todayIso()

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Дата</th>
            <th>Платёж</th>
            <th>Тело долга</th>
            <th>Проценты</th>
            <th>Остаток</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map(entry => (
            <tr key={entry.period} className={entry.dueDate <= today ? styles.pastRow : undefined}>
              <td>{entry.period}</td>
              <td>{formatDateRu(entry.dueDate)}</td>
              <td>{formatMoney(entry.paymentAmount)}</td>
              <td>{formatMoney(entry.principalPart)}</td>
              <td>{formatMoney(entry.interestPart)}</td>
              <td>{formatMoney(entry.remainingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
