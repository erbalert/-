import styles from './EmptyState.module.css'

interface Props {
  icon?: string
  text: string
}

export default function EmptyState({ icon = '📭', text }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>{icon}</div>
      <p className={styles.text}>{text}</p>
    </div>
  )
}
