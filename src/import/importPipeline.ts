import type { Account, Loan, PersistedState, ParsedStatementRow, Transaction } from '../types'
import { extractLines } from './pdfStatement'
import type { StatementParser } from './pdfStatement'
import { kaspiParser } from './parsers/kaspi'
import { halykParser } from './parsers/halyk'
import { suggestCategory } from './autoCategory'
import { detectLoanActivity } from '../utils/loanDetection'
import { dedupeKey } from '../utils/merchant'

export type PipelineTransaction = Omit<Transaction, 'id' | 'createdAt'>

export interface ImportStats {
  imported: number
  duplicates: number
  files: number
  unrecognized: string[]
  perBank: Record<string, number>
  dateRange: { from: string; to: string } | null
  loansDetected: number
}

export interface ImportResult {
  newAccounts: Account[]
  newLoans: Loan[]
  transactions: PipelineTransaction[]
  stats: ImportStats
}

const PARSERS: StatementParser[] = [kaspiParser, halykParser]

interface Staged {
  row: ParsedStatementRow
  accountName: string
}

export async function runImport(files: File[], state: PersistedState): Promise<ImportResult> {
  const existingAccountByName = new Map(state.accounts.map(a => [a.name.toLowerCase(), a]))
  const newAccounts: Account[] = []
  const accountIdByName = new Map<string, string>()

  function resolveAccount(name: string): string {
    const key = name.toLowerCase()
    const cached = accountIdByName.get(key)
    if (cached) return cached
    const existing = existingAccountByName.get(key)
    if (existing) {
      accountIdByName.set(key, existing.id)
      return existing.id
    }
    const acc: Account = { id: crypto.randomUUID(), name, createdAt: Date.now() }
    newAccounts.push(acc)
    accountIdByName.set(key, acc.id)
    return acc.id
  }

  const unrecognized: string[] = []
  const perBank: Record<string, number> = {}
  const staged: Staged[] = []

  for (const file of files) {
    let pages
    try {
      pages = await extractLines(file)
    } catch {
      unrecognized.push(file.name)
      continue
    }
    const parser = PARSERS.find(p => p.detect(pages!))
    if (!parser) {
      unrecognized.push(file.name)
      continue
    }
    const accountName = parser.defaultAccountName(pages)
    const rows = parser.parse(pages)
    perBank[parser.label] = (perBank[parser.label] ?? 0) + rows.length
    for (const row of rows) staged.push({ row, accountName })
  }

  // Dedupe within import and against existing transactions (note holds the description).
  const seen = new Set(state.transactions.map(t => dedupeKey(t.date, t.type, t.amount, t.note ?? '')))
  let duplicates = 0
  const kept: Staged[] = []
  for (const s of staged) {
    const key = dedupeKey(s.row.date, s.row.type, s.row.amount, s.row.description)
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    kept.push(s)
  }

  // Loan detection across kept rows -> auto-create loans + assign loanId.
  const loanTxLike = kept.map(s => ({
    date: s.row.date,
    amount: s.row.amount,
    type: s.row.type,
    description: s.row.description,
  }))
  const { streams, streamKeyByIndex } = detectLoanActivity(loanTxLike)

  const newLoans: Loan[] = []
  const loanIdByStream = new Map<string, string>()
  for (const stream of streams) {
    const id = crypto.randomUUID()
    loanIdByStream.set(stream.key, id)
    // Estimate: if no disbursement seen, assume what's paid plus ~6 more months of debt,
    // so an auto-detected loan doesn't look already paid off.
    const principal = stream.principalDetected ?? Math.round(stream.totalPaid + stream.monthlyPayment * 6)
    newLoans.push({
      id,
      name: stream.name,
      principal,
      interestRate: 0,
      termMonths: 12,
      startDate: stream.firstDate,
      paymentType: 'annuity',
      active: true,
      autoDetected: true,
    })
  }

  const transactions: PipelineTransaction[] = kept.map((s, i) => {
    const accountId = resolveAccount(s.accountName)
    const categoryId = suggestCategory(s.row, state.categories)
    const streamKey = streamKeyByIndex[i]
    const loanId = streamKey ? loanIdByStream.get(streamKey) : undefined
    return {
      type: s.row.type,
      amount: s.row.amount,
      accountId,
      categoryId,
      date: s.row.date,
      note: s.row.description || undefined,
      loanId,
    }
  })

  const dates = kept.map(s => s.row.date).sort()
  const dateRange = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null

  return {
    newAccounts,
    newLoans,
    transactions,
    stats: {
      imported: transactions.length,
      duplicates,
      files: files.length,
      unrecognized,
      perBank,
      dateRange,
      loansDetected: newLoans.length,
    },
  }
}
