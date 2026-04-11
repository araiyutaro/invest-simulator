export default function DashboardPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-gray-600">
        Phase 1 foundation complete. Market data, agent runs, and charts arrive
        in Phase 2-4.
      </p>
      <form action="/api/auth/logout" method="POST" className="mt-8">
        <button type="submit" className="text-sm text-red-600 underline">
          Sign out
        </button>
      </form>
    </main>
  )
}
