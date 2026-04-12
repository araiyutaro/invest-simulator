// PerformanceGrid — 6 performance metrics in a 3×2 grid (Plan 04-03 Task 1).
// Server Component (per D-16): no `'use client'` directive.
// Color rules follow 04-UI-SPEC.md PerformanceGrid section.

import type { PerformanceMetrics } from '@/lib/dashboard/types'

type Props = {
  readonly metrics: PerformanceMetrics | null
}

type Cell = {
  readonly label: string
  readonly value: string
  readonly colorClass: string
}

const EMPTY_COLOR = 'text-slate-400'
const POSITIVE_COLOR = 'text-green-400'
const NEGATIVE_COLOR = 'text-red-400'
const NEUTRAL_COLOR = 'text-slate-300'

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function signedPercentColor(value: number): string {
  return value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR
}

function buildCells(metrics: PerformanceMetrics | null): readonly Cell[] {
  if (metrics === null) {
    const labels = [
      '累計リターン',
      'vs SPY',
      'シャープレシオ',
      '最大DD',
      '勝率',
      '取引数',
    ] as const
    return labels.map((label) => ({
      label,
      value: '—',
      colorClass: EMPTY_COLOR,
    }))
  }

  // Max DD is reported as a positive number by calculateMetrics; display as negative.
  const maxDdDisplay =
    metrics.maxDrawdown === 0
      ? '0.00%'
      : `-${metrics.maxDrawdown.toFixed(2)}%`

  const winRateCell: Cell =
    metrics.winRate === null
      ? { label: '勝率', value: '—', colorClass: EMPTY_COLOR }
      : {
          label: '勝率',
          value: `${metrics.winRate.toFixed(1)}%`,
          colorClass:
            metrics.winRate >= 50 ? POSITIVE_COLOR : NEGATIVE_COLOR,
        }

  return [
    {
      label: '累計リターン',
      value: formatSignedPercent(metrics.totalReturn),
      colorClass: signedPercentColor(metrics.totalReturn),
    },
    {
      label: 'vs SPY',
      value: formatSignedPercent(metrics.spyDiff),
      colorClass: signedPercentColor(metrics.spyDiff),
    },
    {
      label: 'シャープレシオ',
      value: metrics.sharpe.toFixed(2),
      colorClass: signedPercentColor(metrics.sharpe),
    },
    {
      label: '最大DD',
      value: maxDdDisplay,
      colorClass: NEGATIVE_COLOR,
    },
    winRateCell,
    {
      label: '取引数',
      value: metrics.tradeCount.toLocaleString('ja-JP'),
      colorClass: NEUTRAL_COLOR,
    },
  ]
}

export function PerformanceGrid({ metrics }: Props) {
  const cells = buildCells(metrics)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="bg-slate-800 rounded-lg p-6"
        >
          <p className="text-xs text-slate-400 mb-2">{cell.label}</p>
          <p
            className={`text-3xl font-semibold font-mono ${cell.colorClass}`}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  )
}
