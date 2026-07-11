import styles from './BudgetProgressBar.module.css'

interface Props {
  ratio: number
}

export default function BudgetProgressBar({ ratio }: Props) {
  const width = Math.min(ratio, 1) * 100
  const fillClass = ratio > 1 ? styles.fillCritical : ratio >= 0.7 ? styles.fillWarning : styles.fillGood

  return (
    <div className={styles.track} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${styles.fill} ${fillClass}`} style={{ width: `${width}%` }} />
    </div>
  )
}
