import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './icons'
import styles from './EmptyState.module.css'

interface Props {
  icon?: IconName
  text: string
  children?: ReactNode
}

export default function EmptyState({ icon = 'sparkles', text, children }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.iconWrap}>
        <Icon name={icon} size={28} />
      </div>
      <p className={styles.text}>{text}</p>
      {children}
    </div>
  )
}
