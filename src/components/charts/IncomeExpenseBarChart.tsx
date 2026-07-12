import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { PeriodBucket } from '../../utils/analytics'
import { formatMoney } from '../../utils/money'
import styles from './IncomeExpenseBarChart.module.css'

interface Props {
  data: PeriodBucket[]
}

function renderTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      {payload.map(p => (
        <div className={styles.tooltipRow} key={p.name} style={{ color: p.color }}>
          <span>{p.name}</span>
          <span>{formatMoney(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export default function IncomeExpenseBarChart({ data }: Props) {
  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Доходы и расходы по месяцам</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--gridline)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
          <Legend wrapperStyle={{ fontSize: 13, color: 'var(--text-secondary)' }} />
          <Bar dataKey="income" name="Доход" fill="#0ca30c" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Расход" fill="#d03b3b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
