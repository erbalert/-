import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { Category, Transaction } from '../../types'
import { categoryMonthlyTrend } from '../../utils/insights'
import { formatMoney } from '../../utils/money'
import Icon from '../common/Icon'
import styles from './Widget.module.css'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  months: number
}

function renderTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>
      <strong>{label}</strong>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <span>{formatMoney(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export default function MonthlyComparison({ transactions, categories, months }: Props) {
  const data = categoryMonthlyTrend(transactions, categories, months, 5)

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Сравнение месяцев по категориям</span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data.rows} barGap={2} barCategoryGap="18%">
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--gridline)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
          {data.series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {data.deltas.some(d => d.changePct !== null) && (
        <div className={styles.list}>
          {data.deltas
            .filter(d => d.changePct !== null)
            .map(d => (
              <div className={styles.row} key={d.name}>
                <span className={styles.badge} style={{ background: `${d.color}22`, color: d.color }}>
                  <Icon name={d.changePct! >= 0 ? 'arrowUp' : 'arrowDown'} size={16} />
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{d.name}</div>
                  <div className={styles.rowSub}>месяц к месяцу</div>
                </div>
                <span className={`${styles.rowValue} ${d.changePct! >= 0 ? styles.up : styles.down}`}>
                  {d.changePct! >= 0 ? '+' : ''}
                  {Math.round(d.changePct! * 100)}%
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
