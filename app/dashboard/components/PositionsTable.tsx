// PositionsTable — holdings + CASH row (Plan 04-03 Task 2).
// Server Component: no `'use client'` directive.
// Follows 04-UI-SPEC.md PositionsTable section.

import type { PositionWithPrice } from '@/lib/dashboard/types'

type Props = {
  readonly positions: readonly PositionWithPrice[]
  readonly cash: number
  readonly totalValue: number
}

function formatYen(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`
}

function formatSignedYen(value: number): string {
  if (value === 0) return '¥0'
  const abs = Math.round(Math.abs(value)).toLocaleString('ja-JP')
  return value > 0 ? `+¥${abs}` : `-¥${abs}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function pnlColorClass(value: number): string {
  if (value > 0) return 'text-green-400'
  if (value < 0) return 'text-red-400'
  return 'text-slate-300'
}

export function PositionsTable({ positions, cash, totalValue }: Props) {
  if (positions.length === 0 && cash === 0) {
    return (
      <p className="text-sm text-slate-400">
        ポジションなし — 最初の取引が実行されると表示されます
      </p>
    )
  }

  const cashAllocation =
    totalValue === 0 ? 0 : (cash / totalValue) * 100

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-400 border-b border-slate-700">
          <th className="text-left py-2 px-2 font-normal">銘柄</th>
          <th className="text-right py-2 px-2 font-normal">保有数</th>
          <th className="text-right py-2 px-2 font-normal">取得平均価格</th>
          <th className="text-right py-2 px-2 font-normal">現在価格</th>
          <th className="text-right py-2 px-2 font-normal">含み損益</th>
          <th className="text-right py-2 px-2 font-normal">配分比率</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr
            key={position.symbol}
            className="border-b border-slate-700"
          >
            <td className="text-left py-3 px-2 font-mono text-slate-100">
              {position.symbol}
            </td>
            <td className="text-right py-3 px-2 font-mono text-slate-100">
              {position.quantity.toLocaleString('ja-JP')}
            </td>
            <td className="text-right py-3 px-2 font-mono text-slate-100">
              {formatYen(position.avgCost)}
            </td>
            <td className="text-right py-3 px-2 font-mono text-slate-100">
              {formatYen(position.currentPrice)}
            </td>
            <td
              className={`text-right py-3 px-2 font-mono ${pnlColorClass(position.unrealizedPnl)}`}
            >
              {formatSignedYen(position.unrealizedPnl)}
            </td>
            <td className="text-right py-3 px-2 font-mono text-slate-300">
              {formatPercent(position.allocation)}
            </td>
          </tr>
        ))}
        <tr className="border-b border-slate-700">
          <td className="text-left py-3 px-2 font-mono text-slate-100">
            CASH
          </td>
          <td className="text-right py-3 px-2 font-mono text-slate-400">
            —
          </td>
          <td className="text-right py-3 px-2 font-mono text-slate-400">
            —
          </td>
          <td className="text-right py-3 px-2 font-mono text-slate-100">
            {formatYen(cash)}
          </td>
          <td className="text-right py-3 px-2 font-mono text-slate-400">
            —
          </td>
          <td className="text-right py-3 px-2 font-mono text-slate-300">
            {formatPercent(cashAllocation)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
