import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './icons'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  loading?: boolean
  fullWidth?: boolean
  children?: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  children,
  className,
  disabled,
  ...rest
}: Props) {
  const classes = [
    styles.btn,
    styles[variant],
    size !== 'md' ? styles[size] : '',
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const spinnerClass = variant === 'primary' || variant === 'danger' ? styles.spinner : `${styles.spinner} ${styles.spinnerDark}`

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span className={spinnerClass} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      )}
      {children}
    </button>
  )
}
