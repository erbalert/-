import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { BalancePoint } from '../../utils/analytics'
import { formatMoney } from '../../utils/money'
import styles from './BalanceTrendChart.module.css'

interface Props {
  data: BalancePoint[]
}

function renderTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <div>{formatMoney(payload[0].value ?? 0)}</div>
    </div>
  )
}

export default function BalanceTrendChart({ data }: Props) {
  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Баланс во времени</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--gridline)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--gridline)' }} />
          <Line
            type="monotone"
            dataKey="balance"
            name="Баланс"
            stroke="#2a78d6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#2a78d6' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
