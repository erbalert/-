import type { Todo } from '../types'
import styles from './TodoItem.module.css'

interface Props {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export default function TodoItem({ todo, onToggle, onDelete }: Props) {
  return (
    <li className={`${styles.item} ${todo.completed ? styles.completed : ''}`}>
      <button
        className={styles.toggle}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? 'Отметить как незавершённое' : 'Отметить как завершённое'}
      >
        {todo.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span className={styles.text}>{todo.text}</span>
      <button
        className={styles.delete}
        onClick={() => onDelete(todo.id)}
        aria-label="Удалить задачу"
      >
        &times;
      </button>
    </li>
  )
}
