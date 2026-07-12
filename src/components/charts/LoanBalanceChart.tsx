import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { LoanBalancePoint } from '../../utils/loans'
import { formatMoney } from '../../utils/money'
import styles from './LoanBalanceChart.module.css'

interface Props {
  data: LoanBalancePoint[]
}

function renderTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      {payload.map(p => (
        <div className={styles.tooltipRow} key={p.name} style={{ color: p.color }}>
          <span>{p.name}</span>
          <span>{p.value == null ? '—' : formatMoney(p.value as number)}</span>
        </div>
      ))}
    </div>
  )
}

export default function LoanBalanceChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="var(--gridline)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--gridline)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
        <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--gridline)' }} />
        <Legend wrapperStyle={{ fontSize: 13, color: 'var(--text-secondary)' }} />
        <Line type="monotone" dataKey="planned" name="План" stroke="#2a78d6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="actual" name="Факт" stroke="#eb6834" strokeWidth={2} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
