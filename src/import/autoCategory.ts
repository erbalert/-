import type { Category, ParsedStatementRow } from '../types'

interface Rule {
  category: string
  re: RegExp
}

// Order matters — first match wins. Loans/transfers are checked before generic buckets.
const EXPENSE_RULES: Rule[] = [
  { category: 'Кредиты', re: /KASPI\s?КРЕДИТ|ПОГАШЕНИ[ЕЯ][^.]{0,40}(КРЕДИТ|ЗАДОЛЖЕННОСТ)|ОПЛАТА\s+КРЕДИТ|РАССРОЧ|ИПОТЕК|АВТОКРЕДИТ|МИКРОКРЕДИТ/i },
  { category: 'Переводы', re: /ПЕРЕВОД|СНЯТИ|НА СВОЙ|НА ДЕПОЗИТ|ПОПОЛНЕНИЕ СВОЕГО|ВЫВОД СРЕДСТВ|НА КАРТУ|P2P/i },
  { category: 'Продукты', re: /MAGNUM|MART|MARKET|МАРКЕТ|SUPERMARKET|GROCERY|ПРОДУКТ|GALMART|ANVAR|ADAL|SMALL|MAGAZIN|DASTARKHAN|SHYNAR|ARZAN/i },
  { category: 'Здоровье', re: /PHARMACY|АПТЕК|PHARMA|HEALTH|КЛИНИК|MEDIC|АРУ|RAUZE|DENT|HOSPITAL/i },
  { category: 'Кафе и рестораны', re: /RESTORAN|CAFE|КАФЕ|COFFEE|\bBAR\b|REST|ПИЦЦ|BURGER|KFC|SUSHI|FOOD|POST|ДОНЕР|CHAIHANA/i },
  { category: 'Транспорт', re: /TAXI|ТАКСИ|BOLT|YANDEX|\bGAS\b|АЗС|БЕНЗИН|PETROL|WISSOL|АВТО|TRANSPORT|МЕТРО|\bBUS\b|PARKING|ПАРКОВ/i },
  { category: 'Развлечения', re: /KINO|CINEMA|КИНО|GAME|ИГР|ENTERTAIN|КОНЦЕРТ|NETFLIX|SPOTIFY|APPLE\.COM|ANTHROPIC|CLAUDE|\bSUB\b|STEAM|PLAYSTATION/i },
  { category: 'Жильё', re: /АРЕНД|\bRENT\b|КВАРТИР|КОММУНАЛ|УТИЛИТ|ЖКХ|ЭЛЕКТР|ОТОПЛЕН|ГАЗ\b/i },
]

const INCOME_RULES: Rule[] = [
  { category: 'Зарплата', re: /ЗАРПЛАТ|\bЗП\b|SALARY|OPLATA TRUDA/i },
  { category: 'Инвестиции', re: /ПРОЦЕНТ|ДИВИДЕНД|\bВКЛАД\b|DIVIDEND|ИНВЕСТ/i },
  { category: 'Подарки', re: /ПОДАР|GIFT/i },
  { category: 'Пополнения', re: /ПОПОЛНЕНИ|ПЕРЕВОД|С КАРТЫ ДРУГОГО|С ДЕПОЗИТА|ЗАЧИСЛЕНИЕ С|ВХОДЯЩ|С КАРТЫ|НА КАРТУ/i },
]

/** Best-effort category suggestion for an imported statement row. Falls back to "Прочее". */
export function suggestCategory(row: ParsedStatementRow, categories: Category[]): string {
  const pool = categories.filter(c => c.type === row.type)
  if (pool.length === 0) return ''

  const haystack = `${row.description} ${row.operationHint ?? ''}`
  const rules = row.type === 'income' ? INCOME_RULES : EXPENSE_RULES

  for (const rule of rules) {
    if (rule.re.test(haystack)) {
      const found = pool.find(c => c.name === rule.category)
      if (found) return found.id
    }
  }

  const other = pool.find(c => c.name === 'Прочее')
  return (other ?? pool[0]).id
}
