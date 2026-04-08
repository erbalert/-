import { useState, useEffect } from 'react'
import type { Todo, Filter } from './types'
import TodoInput from './components/TodoInput'
import TodoList from './components/TodoList'
import TodoFilter from './components/TodoFilter'
import styles from './App.module.css'

const STORAGE_KEY = 'todos'

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  function addTodo(text: string) {
    setTodos(prev => [
      { id: crypto.randomUUID(), text, completed: false, createdAt: Date.now() },
      ...prev,
    ])
  }

  function toggleTodo(id: string) {
    setTodos(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }

  function deleteTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function clearCompleted() {
    setTodos(prev => prev.filter(t => !t.completed))
  }

  const filtered = todos.filter(t => {
    if (filter === 'active') return !t.completed
    if (filter === 'completed') return t.completed
    return true
  })

  const activeCount = todos.filter(t => !t.completed).length
  const hasCompleted = todos.some(t => t.completed)

  return (
    <div className={styles.app}>
      <h1 className={styles.title}>todos</h1>
      <div className={styles.card}>
        <TodoInput onAdd={addTodo} />
        {todos.length > 0 && (
          <>
            <TodoList todos={filtered} onToggle={toggleTodo} onDelete={deleteTodo} />
            <TodoFilter
              filter={filter}
              onFilter={setFilter}
              activeCount={activeCount}
              hasCompleted={hasCompleted}
              onClearCompleted={clearCompleted}
            />
          </>
        )}
        {todos.length === 0 && (
          <p className={styles.empty}>Добавьте первую задачу</p>
        )}
      </div>
    </div>
  )
}
