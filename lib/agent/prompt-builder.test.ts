import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

// server-only モックを設定（テスト環境ではserver-onlyをスキップ）
vi.mock('server-only', () => ({}))

import {
  buildSystemPrompt,
  buildUserPrompt,
  compressNews,
  computeIndicators,
} from './prompt-builder'
import type { PromptContext, TickerData, PortfolioContext } from './types'

// ---------------------------------------------------------------------------
// computeIndicators
// ---------------------------------------------------------------------------

describe('computeIndicators', () => {
  // 50件以上のclose価格（すべての指標計算に十分なデータ）
  const closePrices50 = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5)

  it('十分なデータがある場合、RSI14を返す', () => {
    const result = computeIndicators(closePrices50)
    expect(result.rsi14).not.toBeNull()
    expect(typeof result.rsi14).toBe('number')
  })

  it('十分なデータがある場合、SMA20を返す', () => {
    const result = computeIndicators(closePrices50)
    expect(result.sma20).not.toBeNull()
    expect(typeof result.sma20).toBe('number')
  })

  it('十分なデータがある場合、SMA50を返す', () => {
    const result = computeIndicators(closePrices50)
    expect(result.sma50).not.toBeNull()
    expect(typeof result.sma50).toBe('number')
  })

  it('十分なデータがある場合、MACDを返す', () => {
    const result = computeIndicators(closePrices50)
    // MACDにはslowPeriod+signalPeriod=35件以上必要
    expect(result.macd).not.toBeNull()
    if (result.macd !== null) {
      expect(typeof result.macd.MACD).toBe('number')
      expect(typeof result.macd.signal).toBe('number')
      expect(typeof result.macd.histogram).toBe('number')
    }
  })

  it('close価格が14件未満の場合、RSIはnull', () => {
    const result = computeIndicators([100, 101, 102, 103, 104])
    expect(result.rsi14).toBeNull()
  })

  it('close価格が空の場合、すべてnull', () => {
    const result = computeIndicators([])
    expect(result.rsi14).toBeNull()
    expect(result.macd).toBeNull()
    expect(result.sma20).toBeNull()
    expect(result.sma50).toBeNull()
  })

  it('SMA20に不足するデータの場合、sma20はnull', () => {
    const prices = Array.from({ length: 15 }, (_, i) => 100 + i)
    const result = computeIndicators(prices)
    expect(result.sma20).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// compressNews
// ---------------------------------------------------------------------------

describe('compressNews', () => {
  const news5 = [
    { headline: 'Headline A', publishedAt: '2026-04-10T00:00:00Z' },
    { headline: 'Headline B', publishedAt: '2026-04-11T00:00:00Z' },
    { headline: 'Headline C', publishedAt: '2026-04-12T00:00:00Z' },
    { headline: 'Headline D', publishedAt: '2026-04-09T00:00:00Z' },
    { headline: 'Headline E', publishedAt: '2026-04-08T00:00:00Z' },
  ]

  it('5件のニュースから最新3件のみ返す', () => {
    const result = compressNews(news5)
    expect(result).toContain('Headline C')
    expect(result).toContain('Headline B')
    expect(result).toContain('Headline A')
    expect(result).not.toContain('Headline D')
    expect(result).not.toContain('Headline E')
  })

  it('出力が<external_news_content>タグで囲まれている', () => {
    const result = compressNews(news5)
    expect(result).toContain('<external_news_content>')
    expect(result).toContain('</external_news_content>')
  })

  it('"untrusted external content"警告が含まれる', () => {
    const result = compressNews(news5)
    expect(result).toContain('untrusted external content')
  })

  it('ニュースが0件の場合、「ニュースなし」を返す', () => {
    const result = compressNews([])
    expect(result).toContain('ニュースなし')
  })

  it('ニュースが3件以下の場合、全件返す', () => {
    const news2 = [
      { headline: 'News 1', publishedAt: '2026-04-12T00:00:00Z' },
      { headline: 'News 2', publishedAt: '2026-04-11T00:00:00Z' },
    ]
    const result = compressNews(news2)
    expect(result).toContain('News 1')
    expect(result).toContain('News 2')
  })

  it('publishedAtがnullのニュースも処理できる', () => {
    const news = [
      { headline: 'News no date', publishedAt: null },
      { headline: 'News with date', publishedAt: '2026-04-12T00:00:00Z' },
    ]
    expect(() => compressNews(news)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('文字列を返す', () => {
    const result = buildSystemPrompt()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('「思考プロセス」が含まれる', () => {
    const result = buildSystemPrompt()
    expect(result).toContain('思考プロセス')
  })

  it('「日本語」が含まれる', () => {
    const result = buildSystemPrompt()
    expect(result).toContain('日本語')
  })

  it('観察重視型のトーンを含む（投資観察）', () => {
    const result = buildSystemPrompt()
    expect(result).toContain('観察')
  })

  it('<external_news_content>タグについての警告が含まれる', () => {
    const result = buildSystemPrompt()
    expect(result).toContain('<external_news_content>')
  })

  it('BUY/SELL/HOLDの3択制約が明示される', () => {
    const result = buildSystemPrompt()
    expect(result).toContain('BUY')
    expect(result).toContain('SELL')
    expect(result).toContain('HOLD')
  })
})

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

function makeTickerData(overrides?: Partial<TickerData>): TickerData {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    market: 'US',
    currency: 'USD',
    latestClose: 175.5,
    priceHistory: Array.from({ length: 60 }, (_, i) => 170 + i * 0.1),
    news: [
      { headline: 'Apple releases new product', publishedAt: '2026-04-12T00:00:00Z' },
    ],
    fundamentals: {
      peRatio: 28.5,
      eps: 6.16,
      marketCap: 2_700_000_000_000,
      week52High: 200,
      week52Low: 150,
    },
    indicators: {
      rsi14: 55.3,
      macd: { MACD: 1.2, signal: 0.8, histogram: 0.4 },
      sma20: 173.0,
      sma50: 168.5,
    },
    ...overrides,
  }
}

function makePortfolioContext(overrides?: Partial<PortfolioContext>): PortfolioContext {
  return {
    portfolioId: 'test-portfolio-id',
    cashJpy: 5_000_000,
    positions: [
      { symbol: 'MSFT', quantity: 10, avgCost: 400, currency: 'USD' },
    ],
    ...overrides,
  }
}

function makeContext(overrides?: Partial<PromptContext>): PromptContext {
  return {
    runDate: '2026-04-12',
    tickers: [makeTickerData()],
    portfolio: makePortfolioContext(),
    fxRateUsdJpy: 150.5,
    ...overrides,
  }
}

describe('buildUserPrompt', () => {
  it('文字列を返す', () => {
    const result = buildUserPrompt(makeContext())
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('実行日が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('2026-04-12')
  })

  it('FXレートが含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('150.5')
  })

  it('現金残高が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('5000000')
  })

  it('銘柄シンボルが含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('AAPL')
  })

  it('銘柄の直近価格が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('175.5')
  })

  it('TA指標（RSI）が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('RSI')
  })

  it('ファンダメンタル情報（P/E）が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('28.5')
  })

  it('ニュースの<external_news_content>タグが含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('<external_news_content>')
  })

  it('ポジション情報が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('MSFT')
  })

  it('JSON出力スキーマの指示が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('market_assessment')
    expect(result).toContain('decisions')
  })

  it('全銘柄について判断を返すよう指示が含まれる', () => {
    const result = buildUserPrompt(makeContext())
    expect(result).toContain('全銘柄')
  })

  it('fxRateUsdJpyがnullの場合もクラッシュしない', () => {
    const ctx = makeContext({ fxRateUsdJpy: null })
    expect(() => buildUserPrompt(ctx)).not.toThrow()
  })

  it('ポジションが空の場合もクラッシュしない', () => {
    const ctx = makeContext({ portfolio: makePortfolioContext({ positions: [] }) })
    expect(() => buildUserPrompt(ctx)).not.toThrow()
  })
})
