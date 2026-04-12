import type { Ticker } from '@/lib/market/types'

export const TICKERS: readonly Ticker[] = [
  { symbol: 'AAPL', market: 'US', name: 'Apple Inc.', currency: 'USD', assetClass: 'equity' },
  { symbol: 'MSFT', market: 'US', name: 'Microsoft Corp.', currency: 'USD', assetClass: 'equity' },
  { symbol: 'NVDA', market: 'US', name: 'NVIDIA Corp.', currency: 'USD', assetClass: 'equity' },
  { symbol: 'GOOGL', market: 'US', name: 'Alphabet Inc.', currency: 'USD', assetClass: 'equity' },
  { symbol: 'AMZN', market: 'US', name: 'Amazon.com Inc.', currency: 'USD', assetClass: 'equity' },
  { symbol: 'SPY', market: 'US', name: 'SPDR S&P 500 ETF', currency: 'USD', assetClass: 'etf' },
  { symbol: '1306.T', market: 'JP', name: 'TOPIX連動型上場投信', currency: 'JPY', assetClass: 'etf' },
  { symbol: '7203.T', market: 'JP', name: 'Toyota Motor', currency: 'JPY', assetClass: 'equity' },
  { symbol: '6758.T', market: 'JP', name: 'Sony Group', currency: 'JPY', assetClass: 'equity' },
  { symbol: '9984.T', market: 'JP', name: 'SoftBank Group', currency: 'JPY', assetClass: 'equity' },
  { symbol: '7974.T', market: 'JP', name: 'Nintendo', currency: 'JPY', assetClass: 'equity' },
] as const

const BY_SYMBOL = new Map(TICKERS.map((t) => [t.symbol, t]))

export function findTicker(symbol: string): Ticker | undefined {
  return BY_SYMBOL.get(symbol)
}
