import { normalizeMerchant } from './merchant'

export interface LoanTxLike {
  date: string
  amount: number
  type: 'income' | 'expense'
  description: string
  categoryId?: string
}

export interface DetectedLoanStream {
  key: string
  name: string
  monthlyPayment: number
  totalPaid: number
  count: number
  firstDate: string
  lastDate: string
  principalDetected?: number
}

// Positive signals of an actual loan repayment.
const LOAN_RE =
  /(kaspi\s?кредит|погашени[ея][^.]{0,40}(кредит|задолженност)|оплата\s+кредит|платеж[^.]{0,20}кредит|рассроч|ипотек|автокредит|микрозайм|микрокредит)/i
// Things that merely contain "кредит" but are NOT loan repayments.
const EXCLUDE_RE = /(кредитн\w*\s+бюро|бюро\s+кредит|страхов|заблокир|кредитн\w*\s+лимит|комисси)/i
const DISBURSE_RE = /(зачислени[ея]\s+за[её]мных|выдача кредита|кредит.*зачисл)/i

function canonicalLabel(description: string): string {
  if (/kaspi\s?кредит/i.test(description)) return 'Kaspi Кредит'
  if (/ипотек/i.test(description)) return 'Ипотека'
  if (/автокредит/i.test(description)) return 'Автокредит'
  if (/рассроч/i.test(description)) return 'Рассрочка'
  if (/погашени[ея][^.]{0,40}(задолженност|кредит)/i.test(description)) return 'Погашение кредита'
  if (/микрозайм|микрокредит/i.test(description)) return 'Микрокредит'
  return 'Кредит'
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function isLoanPayment(tx: LoanTxLike): boolean {
  if (tx.type !== 'expense') return false
  if (EXCLUDE_RE.test(tx.description)) return false
  return LOAN_RE.test(tx.description)
}

export interface LoanDetection {
  streams: DetectedLoanStream[]
  streamKeyByIndex: (string | null)[]
}

export function detectLoanActivity(txs: LoanTxLike[]): LoanDetection {
  const streamKeyByIndex: (string | null)[] = new Array(txs.length).fill(null)
  const groups = new Map<string, { i: number; tx: LoanTxLike }[]>()

  txs.forEach((tx, i) => {
    if (!isLoanPayment(tx)) return
    const key = canonicalLabel(tx.description)
    streamKeyByIndex[i] = key
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ i, tx })
  })

  const disbursements = new Map<string, number>()
  for (const tx of txs) {
    if (tx.type === 'income' && DISBURSE_RE.test(tx.description)) {
      const key = canonicalLabel(tx.description)
      disbursements.set(key, Math.max(disbursements.get(key) ?? 0, tx.amount))
    }
  }

  const streams: DetectedLoanStream[] = []
  const keptKeys = new Set<string>()
  for (const [key, rows] of groups) {
    const principalDetected = disbursements.get(key)
    // Keep only recurring streams (>=2 payments) or ones with a detected disbursement,
    // to avoid one-off "loan-ish" hits becoming tracked loans.
    if (rows.length < 2 && principalDetected === undefined) continue
    keptKeys.add(key)

    const dates = rows.map(r => r.tx.date).sort()
    const monthTotals = new Map<string, number>()
    for (const { tx } of rows) {
      const ym = tx.date.slice(0, 7)
      monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + tx.amount)
    }
    streams.push({
      key,
      name: key,
      monthlyPayment: Math.round(median([...monthTotals.values()])),
      totalPaid: rows.reduce((s, r) => s + r.tx.amount, 0),
      count: rows.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      principalDetected,
    })
  }

  // Null out assignments for streams we dropped.
  for (let i = 0; i < streamKeyByIndex.length; i++) {
    const k = streamKeyByIndex[i]
    if (k && !keptKeys.has(k)) streamKeyByIndex[i] = null
  }

  streams.sort((a, b) => b.totalPaid - a.totalPaid)
  return { streams, streamKeyByIndex }
}
