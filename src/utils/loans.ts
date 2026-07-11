import type { Loan, LoanScheduleEntry, LoanSummary, Transaction } from '../types'
import { addOccurrence, formatDateRu, todayIso } from './date'

export function buildAmortizationSchedule(loan: Loan): LoanScheduleEntry[] {
  const monthlyRate = loan.interestRate / 12 / 100
  const schedule: LoanScheduleEntry[] = []
  let remaining = loan.principal
  let dueDate = loan.startDate

  const annuityPayment =
    monthlyRate === 0
      ? loan.principal / loan.termMonths
      : (loan.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.termMonths))
  const straightPrincipal = loan.principal / loan.termMonths

  for (let period = 1; period <= loan.termMonths; period++) {
    const interestPart = remaining * monthlyRate
    let principalPart: number
    let paymentAmount: number

    if (loan.paymentType === 'annuity') {
      paymentAmount = annuityPayment
      principalPart = paymentAmount - interestPart
    } else {
      principalPart = straightPrincipal
      paymentAmount = principalPart + interestPart
    }

    if (period === loan.termMonths || principalPart > remaining) {
      principalPart = remaining
      paymentAmount = principalPart + interestPart
    }

    remaining = Math.max(0, remaining - principalPart)

    schedule.push({
      period,
      dueDate,
      paymentAmount,
      principalPart,
      interestPart,
      remainingBalance: remaining,
    })

    dueDate = addOccurrence(dueDate, 'monthly')
  }

  return schedule
}

export function summarizeLoan(loan: Loan, transactions: Transaction[]): LoanSummary {
  const schedule = buildAmortizationSchedule(loan)
  const today = todayIso()

  const paidTotal = transactions.filter(t => t.loanId === loan.id).reduce((sum, t) => sum + t.amount, 0)
  const actualRemaining = Math.max(0, loan.principal - paidTotal)

  const pastDue = schedule.filter(s => s.dueDate <= today)
  const plannedRemaining = pastDue.length > 0 ? pastDue[pastDue.length - 1].remainingBalance : loan.principal

  const nextEntry = schedule.find(s => s.dueDate > today) ?? null
  const totalInterest = schedule.reduce((sum, s) => sum + s.interestPart, 0)
  const payoffDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : loan.startDate

  return {
    plannedRemaining,
    actualRemaining,
    paidTotal,
    nextDueDate: nextEntry?.dueDate ?? null,
    nextDueAmount: nextEntry?.paymentAmount ?? null,
    totalInterest,
    payoffDate,
  }
}

export interface LoanBalancePoint {
  period: number
  label: string
  planned: number
  actual: number | null
}

export function buildBalanceHistory(loan: Loan, transactions: Transaction[]): LoanBalancePoint[] {
  const schedule = buildAmortizationSchedule(loan)
  const today = todayIso()
  const payments = transactions.filter(t => t.loanId === loan.id).sort((a, b) => (a.date < b.date ? -1 : 1))

  const points: LoanBalancePoint[] = [{ period: 0, label: 'Начало', planned: loan.principal, actual: loan.principal }]

  for (const entry of schedule) {
    const paidToDate = payments.filter(p => p.date <= entry.dueDate).reduce((sum, p) => sum + p.amount, 0)
    points.push({
      period: entry.period,
      label: formatDateRu(entry.dueDate),
      planned: entry.remainingBalance,
      actual: entry.dueDate <= today ? Math.max(0, loan.principal - paidToDate) : null,
    })
  }

  return points
}
