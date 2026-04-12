'use client'

// TradeTimeline — Plan 04-04 Task 1
// Client Component: manages pagination state + accordion state for reasoning.
// Core Value per 04-CONTEXT.md D-13: reasoning text is expanded by default
// so the user reads the AI's thought process without extra clicks.

import { useCallback, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'

import type { TimelineDay, TimelineTrade } from '@/lib/dashboard/types'

type TradeTimelineProps = {
  readonly initialDays: readonly TimelineDay[]
  readonly portfolioId: string
}

const PAGE_SIZE = 20

function formatDate(dateStr: string): string {
  const d = parseISO(dateStr)
  return format(d, 'yyyy年MM月dd日（E）', { locale: ja })
}

export function TradeTimeline({
  initialDays,
  portfolioId,
}: TradeTimelineProps) {
  const [days, setDays] = useState<readonly TimelineDay[]>(initialDays)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialDays.length >= PAGE_SIZE)

  const loadMore = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        offset: String(days.length),
        limit: String(PAGE_SIZE),
        portfolioId,
      })
      const res = await fetch(`/api/dashboard/timeline?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load timeline')
      const newDays: TimelineDay[] = await res.json()
      setDays((prev) => [...prev, ...newDays])
      setHasMore(newDays.length >= PAGE_SIZE)
    } catch {
      // Silent fail — disable further load attempts.
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [days.length, portfolioId])

  if (days.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        取引履歴はまだありません。最初のエージェント実行後に表示されます。
      </p>
    )
  }

  return (
    <div>
      {days.map((day) => (
        <section key={day.date} className="mb-8">
          <h3 className="text-sm text-slate-400 mb-3">{formatDate(day.date)}</h3>
          {day.marketAssessment && (
            <div className="text-sm text-slate-300 bg-slate-800 rounded-lg p-4 mb-4">
              {day.marketAssessment}
            </div>
          )}
          {day.trades.length === 0 ? (
            <p className="text-sm text-slate-500 italic">この日の取引なし</p>
          ) : (
            day.trades.map((trade, i) => (
              <TradeCard key={`${day.date}-${trade.ticker}-${i}`} trade={trade} />
            ))
          )}
        </section>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-6 py-3 text-sm disabled:opacity-50 transition-colors"
        >
          {loading ? '読み込み中...' : 'さらに読み込む'}
        </button>
      )}
    </div>
  )
}

const CONFIDENCE_STYLES = {
  high: 'bg-green-900/40 text-green-400',
  medium: 'bg-amber-900/40 text-amber-400',
  low: 'bg-red-900/40 text-red-400',
} as const

const CONFIDENCE_LABELS = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
} as const

const ACTION_STYLES = {
  BUY: 'bg-blue-900/40 text-blue-400',
  SELL: 'bg-slate-700 text-slate-300',
} as const

function formatPrice(price: number, currency: string): string {
  if (currency === 'JPY') {
    return `¥${price.toLocaleString('ja-JP')}`
  }
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function TradeCard({ trade }: { readonly trade: TimelineTrade }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <span className="font-mono text-slate-100">{trade.ticker}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded ${ACTION_STYLES[trade.action]}`}
          >
            {trade.action}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${CONFIDENCE_STYLES[trade.confidence]}`}
          >
            {CONFIDENCE_LABELS[trade.confidence]}
          </span>
          <span className="font-mono text-sm text-slate-300">
            {trade.quantity}株 @ {formatPrice(trade.executedPrice, trade.currency)}
          </span>
        </div>
      </div>
      <details open className="mt-2">
        <summary className="text-xs text-slate-400 cursor-pointer">
          判断理由
        </summary>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed whitespace-pre-wrap">
          {trade.reasoning}
        </p>
      </details>
    </div>
  )
}
