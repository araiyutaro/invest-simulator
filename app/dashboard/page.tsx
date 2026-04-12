import { DashboardHeader } from './components/DashboardHeader'

export default async function DashboardPage() {
  return (
    <>
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-8 py-12 space-y-12">
        {/* Section 1: パフォーマンス指標カード (DASH-04) */}
        <section aria-label="パフォーマンス指標">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">パフォーマンス</h2>
          <p className="text-sm text-slate-400">指標データは Plan 03 で実装</p>
        </section>

        {/* Section 2: ポートフォリオ推移チャート (DASH-01) */}
        <section aria-label="ポートフォリオ推移">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">ポートフォリオ推移</h2>
          <p className="text-sm text-slate-400">チャートは Plan 03 で実装</p>
        </section>

        {/* Section 3: ポジション一覧 + 配分パイチャート (DASH-02) */}
        <section aria-label="ポジション">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">ポジション</h2>
          <p className="text-sm text-slate-400">ポジションテーブルは Plan 03 で実装</p>
        </section>

        {/* Section 4: トレードタイムライン (DASH-03) */}
        <section aria-label="トレードタイムライン">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">トレードタイムライン</h2>
          <p className="text-sm text-slate-400">タイムラインは Plan 04 で実装</p>
        </section>
      </main>
    </>
  )
}
