import type { Account, Category, CsvImportError, Transaction, TransactionType } from '../types'
import { CATEGORY_COLOR_PALETTE } from '../constants'

export const CSV_HEADER = ['Дата', 'Тип', 'Счет', 'Категория', 'Сумма', 'Комментарий']

const TYPE_LABEL: Record<TransactionType, string> = { income: 'доход', expense: 'расход' }
const LABEL_TYPE: Record<string, TransactionType> = { доход: 'income', расход: 'expense' }

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

export function exportTransactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[]
): string {
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? ''
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? ''

  const lines = [CSV_HEADER.join(',')]
  for (const t of transactions) {
    const row = [
      t.date,
      TYPE_LABEL[t.type],
      accountName(t.accountId),
      categoryName(t.categoryId),
      t.amount.toFixed(2),
      t.note ?? '',
    ]
    lines.push(row.map(escapeCsvField).join(','))
  }
  return '﻿' + lines.join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export interface ParsedCsvRow {
  date: string
  type: TransactionType
  accountName: string
  categoryName: string
  amount: number
  note?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseCsvContent(content: string): { rows: ParsedCsvRow[]; errors: CsvImportError[] } {
  const clean = content.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const lines = clean.split('\n').filter(l => l.trim().length > 0)
  const rows: ParsedCsvRow[] = []
  const errors: CsvImportError[] = []

  if (lines.length === 0) {
    return { rows, errors: [{ row: 0, message: 'Файл пуст' }] }
  }

  const header = parseCsvLine(lines[0]).map(h => h.trim())
  const headerMatches = CSV_HEADER.every((h, i) => header[i] === h)
  if (!headerMatches) {
    errors.push({ row: 1, message: `Заголовок не соответствует ожидаемому: ${CSV_HEADER.join(',')}` })
    return { rows, errors }
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const fields = parseCsvLine(lines[i])
    const [date, typeLabel, accountName, categoryName, amountStr, note] = fields

    if (!date || !DATE_RE.test(date)) {
      errors.push({ row: rowNumber, message: `Некорректная дата: «${date ?? ''}» (ожидается YYYY-MM-DD)` })
      continue
    }
    const type = LABEL_TYPE[(typeLabel ?? '').trim().toLowerCase()]
    if (!type) {
      errors.push({ row: rowNumber, message: `Некорректный тип: «${typeLabel ?? ''}» (ожидается «доход» или «расход»)` })
      continue
    }
    if (!accountName?.trim()) {
      errors.push({ row: rowNumber, message: 'Не указан счёт' })
      continue
    }
    if (!categoryName?.trim()) {
      errors.push({ row: rowNumber, message: 'Не указана категория' })
      continue
    }
    const amount = Number(amountStr)
    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      errors.push({ row: rowNumber, message: `Некорректная сумма: «${amountStr ?? ''}»` })
      continue
    }

    rows.push({ date, type, accountName: accountName.trim(), categoryName: categoryName.trim(), amount, note: note?.trim() || undefined })
  }

  return { rows, errors }
}

export interface ResolvedImport {
  newAccounts: Account[]
  newCategories: Category[]
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
}

export function resolveImportRows(rows: ParsedCsvRow[], accounts: Account[], categories: Category[]): ResolvedImport {
  const newAccounts: Account[] = []
  const newCategories: Category[] = []
  const transactions: Omit<Transaction, 'id' | 'createdAt'>[] = []

  const accountByName = new Map(accounts.map(a => [a.name.toLowerCase(), a]))
  const categoryByKey = new Map(categories.map(c => [`${c.type}:${c.name.toLowerCase()}`, c]))
  let colorIndex = categories.length

  for (const row of rows) {
    let account = accountByName.get(row.accountName.toLowerCase())
    if (!account) {
      account = { id: crypto.randomUUID(), name: row.accountName, createdAt: Date.now() }
      accountByName.set(row.accountName.toLowerCase(), account)
      newAccounts.push(account)
    }

    const categoryKey = `${row.type}:${row.categoryName.toLowerCase()}`
    let category = categoryByKey.get(categoryKey)
    if (!category) {
      category = {
        id: crypto.randomUUID(),
        name: row.categoryName,
        type: row.type,
        color: CATEGORY_COLOR_PALETTE[colorIndex % CATEGORY_COLOR_PALETTE.length],
      }
      colorIndex++
      categoryByKey.set(categoryKey, category)
      newCategories.push(category)
    }

    transactions.push({
      type: row.type,
      amount: row.amount,
      accountId: account.id,
      categoryId: category.id,
      date: row.date,
      note: row.note,
    })
  }

  return { newAccounts, newCategories, transactions }
}
