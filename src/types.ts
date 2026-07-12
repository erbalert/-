export type TransactionType = 'income' | 'expense'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'
export type LoanPaymentType = 'annuity' | 'differentiated'

export interface Account {
  id: string
  name: string
  createdAt: number
}

export interface Category {
  id: string
  name: string
  type: TransactionType
  color: string
  icon?: string
  isDefault?: boolean
}

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  accountId: string
  categoryId: string
  date: string
  note?: string
  createdAt: number
  recurringId?: string
  loanId?: string
}

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
}

export interface RecurringRule {
  id: string
  type: TransactionType
  amount: number
  accountId: string
  categoryId: string
  note?: string
  frequency: RecurrenceFrequency
  startDate: string
  lastGeneratedDate: string | null
  active: boolean
}

export interface Loan {
  id: string
  name: string
  principal: number
  interestRate: number
  termMonths: number
  startDate: string
  paymentType: LoanPaymentType
  active: boolean
  autoDetected?: boolean
}

export interface TransactionFilters {
  accountId?: string
  categoryId?: string
  type?: TransactionType
  dateFrom?: string
  dateTo?: string
  search?: string
  loanId?: string
}

export interface CsvImportError {
  row: number
  message: string
}

export interface CsvImportResult {
  imported: number
  skipped: number
  errors: CsvImportError[]
}

export interface PersistedState {
  version: 1
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  recurringRules: RecurringRule[]
  loans: Loan[]
}

export interface LoanScheduleEntry {
  period: number
  dueDate: string
  paymentAmount: number
  principalPart: number
  interestPart: number
  remainingBalance: number
}

export interface LoanSummary {
  plannedRemaining: number
  actualRemaining: number
  paidTotal: number
  nextDueDate: string | null
  nextDueAmount: number | null
  totalInterest: number
  payoffDate: string
}

export interface ParsedStatementRow {
  date: string
  amount: number
  type: TransactionType
  description: string
  operationHint?: string
  raw: string
}
