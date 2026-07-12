import type { RecurringRule, Transaction } from '../types'
import { addOccurrence } from './date'

const MAX_OCCURRENCES_PER_RULE = 730

export function materializeDueTransactions(
  rules: RecurringRule[],
  today: string
): { newTransactions: Transaction[]; updatedRules: RecurringRule[] } {
  const newTransactions: Transaction[] = []
  const updatedRules: RecurringRule[] = []

  for (const rule of rules) {
    if (!rule.active) continue

    let cursor = rule.lastGeneratedDate ? addOccurrence(rule.lastGeneratedDate, rule.frequency) : rule.startDate
    let lastGenerated = rule.lastGeneratedDate
    let iterations = 0
    let changed = false

    while (cursor <= today && iterations < MAX_OCCURRENCES_PER_RULE) {
      newTransactions.push({
        id: crypto.randomUUID(),
        type: rule.type,
        amount: rule.amount,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        date: cursor,
        note: rule.note,
        createdAt: Date.now(),
        recurringId: rule.id,
      })
      lastGenerated = cursor
      changed = true
      cursor = addOccurrence(cursor, rule.frequency)
      iterations += 1
    }

    if (changed) {
      updatedRules.push({ ...rule, lastGeneratedDate: lastGenerated })
    }
  }

  return { newTransactions, updatedRules }
}
