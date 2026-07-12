const formatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 2,
})

export function formatMoney(amount: number): string {
  return formatter.format(amount)
}
