import 'server-only'

export class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly symbol?: string,
  ) {
    super(message)
    this.name = 'MarketDataError'
  }
}

export class WhitelistViolationError extends MarketDataError {
  constructor(symbol: string) {
    super(`ticker not whitelisted: ${symbol}`, symbol)
    this.name = 'WhitelistViolationError'
  }
}

export class YahooError extends MarketDataError {
  constructor(message: string, symbol?: string) {
    super(message, symbol)
    this.name = 'YahooError'
  }
}

export class StooqError extends MarketDataError {
  constructor(message: string, symbol?: string) {
    super(message, symbol)
    this.name = 'StooqError'
  }
}

export class FinnhubError extends MarketDataError {
  constructor(message: string, symbol?: string) {
    super(message, symbol)
    this.name = 'FinnhubError'
  }
}
