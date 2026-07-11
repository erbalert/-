import type { Category } from '../../types'
import styles from './CategoryBadge.module.css'

interface Props {
  category: Category | undefined
}

export default function CategoryBadge({ category }: Props) {
  if (!category) return <span className={styles.badge}>Без категории</span>
  return (
    <span className={styles.badge}>
      <span className={styles.swatch} style={{ background: category.color }} />
      {category.icon && <span>{category.icon}</span>}
      {category.name}
    </span>
  )
}
