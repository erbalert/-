import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
        <AreaChart data={data}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b7dff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#8b7dff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--gridline)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--gridline)' }} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Баланс"
            stroke="#6d5efc"
            strokeWidth={2.5}
            fill="url(#balanceFill)"
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
