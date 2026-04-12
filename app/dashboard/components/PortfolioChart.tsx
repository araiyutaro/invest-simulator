'use client'

// PortfolioChart — 3-series line chart (portfolio / SPY / 1306.T) (Plan 04-03 Task 1).
// Client Component (per D-05): lightweight-charts requires browser canvas.
// Chart options follow 04-UI-SPEC.md PortfolioChart section.

import { Chart, LineSeries } from 'lightweight-charts-react-wrapper'

import type { ChartPoint } from '@/lib/dashboard/types'

type Props = {
  readonly portfolio: readonly ChartPoint[]
  readonly spy: readonly ChartPoint[]
  readonly topix: readonly ChartPoint[]
}

// lightweight-charts expects mutable arrays of `{ time, value }`, so we
// produce fresh arrays per render (immutable input → new output each call).
function toLineData(series: readonly ChartPoint[]) {
  return series.map((p) => ({ time: p.time, value: p.value }))
}

export function PortfolioChart({ portfolio, spy, topix }: Props) {
  if (portfolio.length === 0) {
    return (
      <div
        aria-label="ポートフォリオ推移チャート"
        className="h-[400px] bg-slate-800 rounded-lg flex items-center justify-center"
      >
        <p className="text-sm text-slate-400">
          運用開始後にデータが表示されます
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-4 flex gap-4 text-xs z-10 pointer-events-none">
        <span className="text-blue-400">● ポートフォリオ</span>
        <span className="text-slate-500">● SPY</span>
        <span style={{ color: '#475569' }}>● 1306.T</span>
      </div>
      <div aria-label="ポートフォリオ推移チャート">
        <Chart
          autoSize
          height={400}
          layout={{
            background: { color: '#0f172a' },
            textColor: '#cbd5e1',
          }}
          grid={{
            vertLines: { color: '#1e293b' },
            horzLines: { color: '#1e293b' },
          }}
        >
          <LineSeries
            data={toLineData(portfolio)}
            color="#60a5fa"
            lineWidth={2}
          />
          <LineSeries
            data={toLineData(spy)}
            color="#64748b"
            lineWidth={1}
          />
          <LineSeries
            data={toLineData(topix)}
            color="#475569"
            lineWidth={1}
          />
        </Chart>
      </div>
    </div>
  )
}
