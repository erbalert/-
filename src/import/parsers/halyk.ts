import type { ParsedStatementRow } from '../../types'
import type { RawLine, StatementParser } from '../pdfStatement'
import { allText, parseAmount } from '../pdfStatement'

// Two leading dates: дата проведения + дата обработки.
const START_DATES_RE = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}\.\d{2}\.\d{4})\s+(.*)$/
const LEADING_DATE_RE = /^\d{2}\.\d{2}\.\d{4}\b/

// Trailing columns: Сумма | Валюта | Приход(KZT) | Расход(KZT) | Комиссия | № счёта/карты
const NUM = '-?\\d[\\d ]*,\\d{2}'
const TAIL_RE = new RegExp(
  `(${NUM})\\s+(KZT|USD)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+([\\dA-Z*]+)\\s*$`
)

const NOISE_RE =
  /(Выписка по счету|Народный Банк|карточки|Приход в|Расход в|Описание операции|проведения|обработки|валюте счета|БИК|HSBKKZKX|halykbank|Всего:|Комиссия)/i

function toIsoDate(dd: string, mm: string, yyyy: string): string {
  return `${yyyy}-${mm}-${dd}`
}

export const halykParser: StatementParser = {
  bankId: 'halyk',
  label: 'Halyk Bank',

  detect(pages: RawLine[][]): boolean {
    const text = allText(pages)
    return /Народный Банк/i.test(text) || /HSBKKZKX/i.test(text)
  },

  defaultAccountName(pages: RawLine[][]): string {
    const text = allText(pages)
    const m = text.match(/Тип счета[^\n]*«([^»]+)»/)
    return m ? `Halyk ${m[1]}` : 'Halyk'
  },

  parse(pages: RawLine[][]): ParsedStatementRow[] {
    const rows: ParsedStatementRow[] = []
    let current: ParsedStatementRow | null = null

    for (const page of pages) {
      for (const line of page) {
        const startMatch = line.text.match(START_DATES_RE)

        if (startMatch) {
          const tail = line.text.match(TAIL_RE)
          if (!tail) {
            current = null
            continue
          }
          const incoming = parseAmount(tail[3]) ?? 0
          const outgoing = parseAmount(tail[4]) ?? 0

          let type: 'income' | 'expense'
          let amount: number
          if (incoming > 0) {
            type = 'income'
            amount = incoming
          } else {
            type = 'expense'
            amount = outgoing
          }
          if (amount === 0) {
            current = null
            continue
          }

          const [dd, mm, yyyy] = [startMatch[1], startMatch[2], startMatch[3]]
          // Description = text between the second date and the trailing columns.
          const middle = startMatch[5]
          const tailStart = middle.search(TAIL_RE)
          const description = (tailStart >= 0 ? middle.slice(0, tailStart) : middle).trim()

          current = {
            date: toIsoDate(dd, mm, yyyy),
            amount,
            type,
            description,
            raw: line.text,
          }
          rows.push(current)
        } else if (current && !LEADING_DATE_RE.test(line.text) && !NOISE_RE.test(line.text)) {
          // Wrapped description continuation (e.g. "коммерсанта IP EMIR").
          current.description = `${current.description} ${line.text}`.trim()
          current.raw = `${current.raw} ${line.text}`
        }
      }
    }

    return rows
  },
}
