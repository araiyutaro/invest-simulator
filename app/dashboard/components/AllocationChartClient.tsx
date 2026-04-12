'use client'

// AllocationChartClient — client wrapper that loads AllocationChart with
// `dynamic(..., { ssr: false })`. Same rationale as PortfolioChartClient:
// Next.js 16 forbids `ssr: false` in Server Components.

import dynamic from 'next/dynamic'

import type { AllocationSlice } from '@/lib/dashboard/types'

type Props = {
  readonly data: readonly AllocationSlice[]
}

const AllocationChart = dynamic(
  () =>
    import('./AllocationChart').then((mod) => ({
      default: mod.AllocationChart,
    })),
  { ssr: false }
)

export function AllocationChartClient(props: Props) {
  return <AllocationChart {...props} />
}
