'use client'

// PortfolioChartClient — client wrapper that loads PortfolioChart with
// `dynamic(..., { ssr: false })`. Next.js 16 disallows `ssr: false` from
// Server Components (see node_modules/next/dist/docs/01-app/02-guides/
// lazy-loading.md, line 94), so the dynamic call lives here in a client
// boundary. Server page.tsx imports this wrapper statically.

import dynamic from 'next/dynamic'

import type { ChartPoint } from '@/lib/dashboard/types'

type Props = {
  readonly portfolio: readonly ChartPoint[]
  readonly spy: readonly ChartPoint[]
  readonly topix: readonly ChartPoint[]
}

const PortfolioChart = dynamic(
  () =>
    import('./PortfolioChart').then((mod) => ({
      default: mod.PortfolioChart,
    })),
  { ssr: false }
)

export function PortfolioChartClient(props: Props) {
  return <PortfolioChart {...props} />
}
