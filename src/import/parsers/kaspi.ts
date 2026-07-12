import type { ParsedStatementRow } from '../../types'
import type { RawLine, StatementParser } from '../pdfStatement'
import { allText, parseAmount } from '../pdfStatement'

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{2})\b/
// Signed amount ending with the tenge sign: "- 20 000,00 ₸" / "+ 181 000,00 ₸"
const AMOUNT_RE = /([+\-−])\s*([\d\s]+,\d{2})\s*₸/

const NOISE_RE = /(Kaspi Bank|CASPKZKA|Приложение к Справке|Дата\s+Сумма\s+Операция|kaspi\.kz)/i

function toIsoDate(dd: string, mm: string, yy: string): string {
  return `20${yy}-${mm}-${dd}`
}

export const kaspiParser: StatementParser = {
  bankId: 'kaspi',
  label: 'Kaspi Bank',

  detect(pages: RawLine[][]): boolean {
    const text = allText(pages)
    return /Kaspi\s*Gold/i.test(text) || /CASPKZKA/i.test(text)
  },

  defaultAccountName(): string {
    return 'Kaspi Gold'
  },

  parse(pages: RawLine[][]): ParsedStatementRow[] {
    const rows: ParsedStatementRow[] = []
    let current: ParsedStatementRow | null = null

    for (const page of pages) {
      for (const line of page) {
        const dateMatch = line.text.match(DATE_RE)

        if (dateMatch) {
          const amountMatch = line.text.match(AMOUNT_RE)
          if (!amountMatch) {
            // Date line without an amount — not a transaction row we understand.
            continue
          }
          const amount = parseAmount(amountMatch[2])
          if (amount === null) continue

          const sign = amountMatch[1]
          const type = sign === '+' ? 'income' : 'expense'
          const [dd, mm, yy] = [dateMatch[1], dateMatch[2], dateMatch[3]]

          // Everything after the amount is "Операция + Детали".
          const afterAmount = line.text.slice((amountMatch.index ?? 0) + amountMatch[0].length).trim()
          const operationHint = afterAmount.split(' ')[0] || undefined

          current = {
            date: toIsoDate(dd, mm, yy),
            amount,
            type,
            description: afterAmount,
            operationHint,
            raw: line.text,
          }
          rows.push(current)
        } else if (current && !NOISE_RE.test(line.text)) {
          // Continuation of the previous transaction's details (wrapped text).
          current.description = `${current.description} ${line.text}`.trim()
          current.raw = `${current.raw} ${line.text}`
        }
      }
    }

    return rows
  },
}
