import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { Transaction } from '../../types'
import { savingsByPeriod } from '../../utils/insights'
import { formatMoney } from '../../utils/money'
import styles from './Widget.module.css'

interface Props {
  transactions: Transaction[]
  months: number
}

function renderTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const net = payload[0].value ?? 0
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}>
      <strong>{label}</strong>
      <div>Отложено: {formatMoney(net)}</div>
    </div>
  )
}

export default function CashflowWidget({ transactions, months }: Props) {
  const { points, avgSavingsRate, totalNet } = savingsByPeriod(transactions, months)
  const data = points.map(p => ({ label: p.label, net: p.net }))

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Норма сбережений</span>
      </div>
      <div className={styles.headline} style={{ color: avgSavingsRate >= 0 ? 'var(--income)' : 'var(--expense)' }}>
        {Math.round(avgSavingsRate * 100)}%
      </div>
      <div className={styles.headlineSub}>
        {totalNet >= 0 ? 'Отложено за период ' : 'Перерасход за период '}
        {formatMoney(Math.abs(totalNet))}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="net" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.net >= 0 ? '#16a55b' : '#e0455f'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
