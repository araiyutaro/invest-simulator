import { describe, it, expect } from 'vitest'
import {
  GeminiDecisionItemSchema,
  GeminiResponseSchema,
  estimateTokenCostUsd,
  GEMINI_INPUT_PRICE_PER_TOKEN,
  GEMINI_OUTPUT_PRICE_PER_TOKEN,
} from './types'

describe('GeminiDecisionItemSchema', () => {
  const validItem = {
    ticker: 'AAPL',
    action: 'BUY',
    quantity: 10,
    confidence: 'high',
    reasoning: 'Strong earnings growth',
  }

  it('有効なBUYアクションをパースする', () => {
    const result = GeminiDecisionItemSchema.safeParse(validItem)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('BUY')
    }
  })

  it('有効なSELLアクションをパースする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, action: 'SELL' })
    expect(result.success).toBe(true)
  })

  it('有効なHOLDアクションをパースする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, action: 'HOLD' })
    expect(result.success).toBe(true)
  })

  it('小文字のアクション"buy"を"BUY"に変換する（preprocess）', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, action: 'buy' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('BUY')
    }
  })

  it('小文字の"sell"を"SELL"に変換する（preprocess）', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, action: 'sell' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('SELL')
    }
  })

  it('無効なアクション"SKIP"をrejectする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, action: 'SKIP' })
    expect(result.success).toBe(false)
  })

  it('confidenceが"high"/"medium"/"low"以外の場合rejectする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, confidence: 'very_high' })
    expect(result.success).toBe(false)
  })

  it('confidenceの大文字"HIGH"を"high"に変換する（preprocess）', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, confidence: 'HIGH' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.confidence).toBe('high')
    }
  })

  it('quantityが負数の場合rejectする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, quantity: -1 })
    expect(result.success).toBe(false)
  })

  it('quantityが0のときは有効（HOLD相当）', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, quantity: 0 })
    expect(result.success).toBe(true)
  })

  it('tickerが空文字の場合rejectする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, ticker: '' })
    expect(result.success).toBe(false)
  })

  it('reasoningが空文字の場合rejectする', () => {
    const result = GeminiDecisionItemSchema.safeParse({ ...validItem, reasoning: '' })
    expect(result.success).toBe(false)
  })
})

describe('GeminiResponseSchema', () => {
  const validResponse = {
    market_assessment: '市場は上昇トレンド',
    decisions: [
      {
        ticker: 'AAPL',
        action: 'BUY',
        quantity: 5,
        confidence: 'high',
        reasoning: '業績好調',
      },
    ],
  }

  it('有効なレスポンスをパースする', () => {
    const result = GeminiResponseSchema.safeParse(validResponse)
    expect(result.success).toBe(true)
  })

  it('market_assessmentが空文字の場合rejectする', () => {
    const result = GeminiResponseSchema.safeParse({ ...validResponse, market_assessment: '' })
    expect(result.success).toBe(false)
  })

  it('decisionsが空配列でも有効', () => {
    const result = GeminiResponseSchema.safeParse({ ...validResponse, decisions: [] })
    expect(result.success).toBe(true)
  })

  it('decisionsに無効なアイテムが含まれる場合rejectする', () => {
    const result = GeminiResponseSchema.safeParse({
      ...validResponse,
      decisions: [{ ticker: 'AAPL', action: 'INVALID', quantity: 5, confidence: 'high', reasoning: 'test' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('estimateTokenCostUsd', () => {
  it('トークンコストを正しく計算する', () => {
    const cost = estimateTokenCostUsd(1_000_000, 1_000_000)
    // input: 1M * 0.30/1M = 0.30, output: 1M * 2.50/1M = 2.50
    expect(cost).toBeCloseTo(2.80, 5)
  })

  it('0トークンのときコストは0', () => {
    expect(estimateTokenCostUsd(0, 0)).toBe(0)
  })

  it('GEMINI_INPUT_PRICE_PER_TOKENが正の値', () => {
    expect(GEMINI_INPUT_PRICE_PER_TOKEN).toBeGreaterThan(0)
  })

  it('GEMINI_OUTPUT_PRICE_PER_TOKENがINPUTより高い', () => {
    expect(GEMINI_OUTPUT_PRICE_PER_TOKEN).toBeGreaterThan(GEMINI_INPUT_PRICE_PER_TOKEN)
  })
})
