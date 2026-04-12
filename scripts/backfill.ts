// CLI script — run via `pnpm backfill [--symbol AAPL] [--days 100]`
// NOT imported from app code. Bypasses Vercel 60s timeout (PITFALLS #3).
//
// IMPORTANT: Must be invoked with `--conditions react-server` so that
// `server-only` resolves to its no-op export (the orchestrator chain
// imports `server-only` in persist.ts and db/index.ts).
//
// The package.json `backfill` script handles this automatically.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Arg parsing (no heavy imports — --help must exit instantly)
// ---------------------------------------------------------------------------

type FetchMode = 'incremental' | 'backfill'

type CliArgs = {
  readonly symbol?: string
  readonly days: number
  readonly mode: FetchMode
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: { symbol?: string; days: number; mode: FetchMode } = {
    days: 100,
    mode: 'backfill',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--symbol' && argv[i + 1]) {
      out.symbol = argv[++i]
    } else if (a === '--days' && argv[i + 1]) {
      out.days = Number(argv[++i])
    } else if (a === '--mode' && argv[i + 1]) {
      const v = argv[++i]
      if (v === 'incremental' || v === 'backfill') {
        out.mode = v
      } else {
        console.error(`[backfill] invalid --mode: ${v} (must be incremental|backfill)`)
        process.exit(1)
      }
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm backfill [--symbol SYM] [--days N] [--mode incremental|backfill]',
      )
      console.log('')
      console.log('Options:')
      console.log('  --symbol SYM   Fetch only this ticker (e.g. AAPL, 7203.T)')
      console.log('  --days N       Number of historical days (default: 100)')
      console.log('  --mode MODE    incremental | backfill (default: backfill)')
      console.log('  --help, -h     Show this help')
      process.exit(0)
    }
  }
  return out
}

// Handle --help before any heavy imports
const args = parseArgs(process.argv.slice(2))

// ---------------------------------------------------------------------------
// Load .env.local manually (dotenv is not installed; .env.local values may
// contain ampersands which break shell `source`, so we parse here).
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  let content: string
  try {
    content = readFileSync(envPath, 'utf8')
  } catch {
    // .env.local not found — rely on shell-exported env vars
    return
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1)
    // Only set if not already in env (explicit exports take precedence)
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadEnvLocal()

// ---------------------------------------------------------------------------
// Main — dynamic import so --help exits before loading the full module tree
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { fetchMarketData } = await import('../lib/market/orchestrator')

  console.log(
    `[backfill] mode=${args.mode} days=${args.days}${args.symbol ? ` symbol=${args.symbol}` : ''}`,
  )

  const started = Date.now()

  const result = await fetchMarketData({
    mode: args.mode,
    daysBack: args.days,
    onlySymbols: args.symbol ? [args.symbol] : undefined,
  })

  const durationS = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`[backfill] completed in ${durationS}s`)
  console.log(`  ok:           ${result.ok.join(', ') || '(none)'}`)
  console.log(
    `  failed:       ${result.failed.map((f) => `${f.symbol}: ${f.reason}`).join(', ') || '(none)'}`,
  )
  console.log(
    `  marketClosed: ${result.marketClosed.join(', ') || '(none)'}`,
  )

  process.exit(result.failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[backfill] fatal:', e)
  process.exit(2)
})
