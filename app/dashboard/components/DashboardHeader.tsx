export function DashboardHeader() {
  return (
    <header className="flex justify-between items-center h-14 px-8 bg-slate-900 border-b border-slate-800">
      <h1 className="text-lg font-semibold text-slate-100">AI投資観察ダッシュボード</h1>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
        >
          サインアウト
        </button>
      </form>
    </header>
  )
}
