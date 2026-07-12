// Normalizes a statement description into a clean merchant / counterparty name.
// Used by dedup, subscription detection and top-merchants analytics.

const PREFIXES = [
  /^операция оплаты у коммерсанта\s*/i,
  /^операция оплаты\s*/i,
  /^покупка\s*/i,
  /^перевод на другую карту\s*/i,
  /^перевод на свой счет\s*/i,
  /^перевод\s*/i,
  /^пополнение\s*/i,
  /^оплата\s*/i,
  /^снятие( наличных)?\s*/i,
  /^зачисление( с депозита| заемных| заёмных)?\s*/i,
  /^погашение( задолженности)?( по карт-счету)?\s*/i,
]

export function normalizeMerchant(description: string): string {
  let s = (description || '').trim()

  // Drop card masks like 400303******5646 and IBANs like KZ106010002008028380.
  s = s.replace(/\b\d{4,6}\*+\d{2,4}\b/g, ' ')
  s = s.replace(/\bKZ\d{16,20}\b/gi, ' ')
  // Drop parenthetical currency notes e.g. "(- 23,20 USD)".
  s = s.replace(/\([^)]*\b(USD|EUR|RUB|KZT)\b[^)]*\)/gi, ' ')

  for (const re of PREFIXES) s = s.replace(re, '')

  // Collapse whitespace, trim separators.
  s = s.replace(/\s+/g, ' ').replace(/[·|,\-–—\s]+$/g, '').trim()

  if (!s) return description.trim() || 'Прочее'
  // Cap length so a very long description doesn't dominate.
  return s.length > 48 ? s.slice(0, 48).trim() : s
}

/** A stable key for deduplicating a transaction/row. */
export function dedupeKey(date: string, type: string, amount: number, description: string): string {
  return `${date}|${type}|${amount.toFixed(2)}|${normalizeMerchant(description).toLowerCase()}`
}
