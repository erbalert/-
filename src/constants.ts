import type { Category } from './types'

export const STORAGE_KEY = 'finance-tracker-state'

// Validated categorical palette (see dataviz skill), fixed order 1-8: blue, aqua, yellow, green, violet, red, magenta, orange.
export const CATEGORY_COLOR_PALETTE = [
  '#2a78d6', '#1baf7a', '#eda100', '#008300',
  '#4a3aa7', '#e34948', '#e87ba4', '#eb6834',
]

export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Продукты', type: 'expense', color: CATEGORY_COLOR_PALETTE[0], icon: '🛒', isDefault: true },
  { name: 'Транспорт', type: 'expense', color: CATEGORY_COLOR_PALETTE[1], icon: '🚗', isDefault: true },
  { name: 'Жильё', type: 'expense', color: CATEGORY_COLOR_PALETTE[2], icon: '🏠', isDefault: true },
  { name: 'Кафе и рестораны', type: 'expense', color: CATEGORY_COLOR_PALETTE[3], icon: '🍽️', isDefault: true },
  { name: 'Здоровье', type: 'expense', color: CATEGORY_COLOR_PALETTE[4], icon: '💊', isDefault: true },
  { name: 'Развлечения', type: 'expense', color: CATEGORY_COLOR_PALETTE[5], icon: '🎬', isDefault: true },
  { name: 'Кредиты', type: 'expense', color: CATEGORY_COLOR_PALETTE[6], icon: '🏦', isDefault: true },
  { name: 'Прочее', type: 'expense', color: CATEGORY_COLOR_PALETTE[7], icon: '📦', isDefault: true },
]

export const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Зарплата', type: 'income', color: CATEGORY_COLOR_PALETTE[3], icon: '💼', isDefault: true },
  { name: 'Подработка', type: 'income', color: CATEGORY_COLOR_PALETTE[1], icon: '🧰', isDefault: true },
  { name: 'Инвестиции', type: 'income', color: CATEGORY_COLOR_PALETTE[0], icon: '📈', isDefault: true },
  { name: 'Подарки', type: 'income', color: CATEGORY_COLOR_PALETTE[6], icon: '🎁', isDefault: true },
  { name: 'Прочее', type: 'income', color: CATEGORY_COLOR_PALETTE[7], icon: '📦', isDefault: true },
]

export const MAX_PIE_SLICES = 7
export const OTHER_SLICE_COLOR = '#898781'
