'use client'

// AllocationChart — Recharts donut (Plan 04-03 Task 2).
// Client Component (per D-09): Recharts renders via SVG in the browser.
// Follows 04-UI-SPEC.md AllocationChart section.

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import type { AllocationSlice } from '@/lib/dashboard/types'

type Props = {
  readonly data: readonly AllocationSlice[]
}

// 10-color palette (last index reserved for CASH).
const COLORS = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#fb923c',
  '#38bdf8',
  '#86efac',
  '#fde68a',
  '#64748b',
] as const

const CASH_COLOR = '#64748b'

function colorForSlice(index: number, total: number, name: string): string {
  // Last entry is assumed to be CASH (per queries.ts construction).
  if (index === total - 1 || name === 'CASH') return CASH_COLOR
  return COLORS[index % COLORS.length]
}

type TooltipPayloadItem = {
  readonly name?: string | number
  readonly value?: number
  readonly payload?: { readonly name?: string; readonly value?: number }
}

function renderTooltip(
  props: {
    active?: boolean
    payload?: readonly TooltipPayloadItem[]
  },
  total: number
) {
  if (!props.active || !props.payload || props.payload.length === 0) return null
  const item = props.payload[0]
  const name = item.payload?.name ?? item.name ?? ''
  const value = item.value ?? 0
  const percent = total === 0 ? 0 : (value / total) * 100
  return (
    <div className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-slate-100">
      {String(name)}: {percent.toFixed(1)}%
    </div>
  )
}

export function AllocationChart({ data }: Props) {
  // Drop zero-value slices from the visible donut (but keep them in the
  // allocation list if caller provided them — Recharts renders 0 slices as
  // invisible arcs which still show in tooltips).
  const visible = data.filter((slice) => slice.value > 0)

  if (visible.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-sm text-slate-400">配分データなし</p>
      </div>
    )
  }

  const total = visible.reduce((sum, slice) => sum + slice.value, 0)
  // Recharts mutates / sorts inputs — pass a fresh mutable copy.
  const chartData = visible.map((slice) => ({
    name: slice.name,
    value: slice.value,
  }))

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius="60%"
            outerRadius="90%"
            stroke="#0f172a"
          >
            {chartData.map((slice, index) => (
              <Cell
                key={slice.name}
                fill={colorForSlice(index, chartData.length, slice.name)}
              />
            ))}
          </Pie>
          <Tooltip
            content={(props) =>
              renderTooltip(props as Parameters<typeof renderTooltip>[0], total)
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
