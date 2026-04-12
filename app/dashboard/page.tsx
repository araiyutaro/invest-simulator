// Dashboard page — Server Component that fetches all dashboard data in
// parallel, computes performance metrics, and renders the 4 primary
// sections (Plan 04-03 Task 3).
//
// Rule 3 deviation: Next.js 16 disallows `dynamic(..., { ssr: false })` in
// Server Components. The SSR-bailout lives in PortfolioChartClient /
// AllocationChartClient (client wrappers). See node_modules/next/dist/
// docs/01-app/02-guides/lazy-loading.md line 94.

import { AllocationChartClient } from './components/AllocationChartClient'
import { DashboardHeader } from './components/DashboardHeader'
import { PerformanceGrid } from './components/PerformanceGrid'
import { PortfolioChartClient } from './components/PortfolioChartClient'
import { PositionsTable } from './components/PositionsTable'
import { TradeTimeline } from './components/TradeTimeline'

import { calculateMetrics, normalizeToPercent } from '@/lib/dashboard/metrics'
import {
  getChartData,
  getPerformanceData,
  getPortfolioId,
  getPositionsWithPrices,
  getTimelineData,
} from '@/lib/dashboard/queries'

export default async function DashboardPage() {
  let portfolioId: string
  try {
    portfolioId = await getPortfolioId()
  } catch {
    return (
      <>
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-8 py-12">
          <p className="text-sm text-slate-400">
            ポートフォリオが見つかりません。最初のエージェント実行後に表示されます。
          </p>
        </main>
      </>
    )
  }

  const [chartData, positionData, perfData, timelineData] = await Promise.all([
    getChartData(portfolioId),
    getPositionsWithPrices(portfolioId),
    getPerformanceData(portfolioId),
    getTimelineData(portfolioId, 20, 0),
  ])

  const metrics = calculateMetrics(perfData)
  const portfolioChart = normalizeToPercent(chartData.portfolio)
  const spyChart = normalizeToPercent(chartData.spy)
  const topixChart = normalizeToPercent(chartData.topix)

  const positionsMarketValue = positionData.positions.reduce(
    (sum, position) =>
      sum + position.currentPrice * position.quantity,
    0
  )
  const totalValue = positionsMarketValue + positionData.cash

  return (
    <>
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-8 py-12 space-y-12">
        <section aria-label="パフォーマンス指標">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            パフォーマンス
          </h2>
          <PerformanceGrid metrics={metrics} />
        </section>

        <section aria-label="ポートフォリオ推移">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            ポートフォリオ推移
          </h2>
          <PortfolioChartClient
            portfolio={portfolioChart}
            spy={spyChart}
            topix={topixChart}
          />
        </section>

        <section aria-label="ポジション">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            ポジション
          </h2>
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-3/5">
              <PositionsTable
                positions={positionData.positions}
                cash={positionData.cash}
                totalValue={totalValue}
              />
            </div>
            <div className="lg:w-2/5">
              <AllocationChartClient data={positionData.allocations} />
            </div>
          </div>
        </section>

        <section aria-label="トレードタイムライン">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            トレードタイムライン
          </h2>
          <TradeTimeline
            initialDays={timelineData}
            portfolioId={portfolioId}
          />
        </section>
      </main>
    </>
  )
}
