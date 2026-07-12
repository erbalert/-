import type { ButtonHTMLAttributes } from 'react'
import Icon from './Icon'
import type { IconName } from './icons'
import styles from './IconButton.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  danger?: boolean
  size?: number
}

export default function IconButton({ icon, label, danger = false, size = 18, className, ...rest }: Props) {
  return (
    <button
      className={`${styles.btn} ${danger ? styles.danger : ''} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}
