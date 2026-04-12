// types only — no runtime imports
export type Market = 'US' | 'JP'
export type AssetClass = 'equity' | 'etf' | 'fx'
export type Currency = 'USD' | 'JPY'
export type MarketSource = 'finnhub' | 'yahoo' | 'stooq' | 'none'

export type Ticker = {
  symbol: string // yahoo-finance2 native format (D-28): 'AAPL', '7203.T'
  market: Market
  name: string
  currency: Currency
  assetClass: AssetClass
}

export type OhlcvRow = {
  symbol: string
  priceDate: string // YYYY-MM-DD ISO
  open: string | null // numeric(18,4) stringified
  high: string | null
  low: string | null
  close: string | null
  rawClose: string | null // per 02-SPIKE-RAW-CLOSE.md decision
  volume: string | null // bigint stringified or null
  currency: Currency
  source: MarketSource
  marketClosed: boolean
  assetClass: AssetClass
}
