import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

interface Props extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  selected?: boolean
  children: ReactNode
}

export default function Card({ interactive = false, selected = false, children, className, ...rest }: Props) {
  const classes = [
    styles.card,
    interactive ? styles.interactive : '',
    selected ? styles.selected : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
