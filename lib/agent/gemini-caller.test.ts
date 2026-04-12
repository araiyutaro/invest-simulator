// lib/agent/gemini-caller.test.ts
// TDD: tests for Gemini API caller module
// Run: npx vitest run lib/agent/gemini-caller.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Bypass server-only module restriction in test environment
vi.mock('server-only', () => ({}))

// Mock the genAI client using vi.hoisted to avoid TDZ issues
const { mockGenerateContent, mockGetGenerativeModel } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const mockGetGenerativeModel = vi.fn(() => ({
    generateContent: mockGenerateContent,
  }))
  return { mockGenerateContent, mockGetGenerativeModel }
})

vi.mock('@/lib/ai/client', () => ({
  genAI: {
    getGenerativeModel: mockGetGenerativeModel,
  },
  GEMINI_MODEL: 'gemini-2.5-flash',
}))

import { callGemini } from './gemini-caller'
import { GEMINI_INPUT_PRICE_PER_TOKEN, GEMINI_OUTPUT_PRICE_PER_TOKEN } from './types'

// ---------------------------------------------------------------------------
// Helper: build a mock Gemini response
// ---------------------------------------------------------------------------

function makeMockResponse(json: object, usage = { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 }) {
  return {
    response: {
      text: () => JSON.stringify(json),
      usageMetadata: usage,
    },
  }
}

const VALID_GEMINI_JSON = {
  market_assessment: '市場は安定しており、テクノロジーセクターが強い。',
  decisions: [
    {
      ticker: 'AAPL',
      action: 'BUY',
      quantity: 10,
      confidence: 'high',
      reasoning: 'Appleは堅調な業績が期待される。',
    },
    {
      ticker: 'MSFT',
      action: 'HOLD',
      quantity: 0,
      confidence: 'medium',
      reasoning: 'Microsoft は現在の価格で保有を継続。',
    },
  ],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('callGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('正常応答時: ok=true でGeminiResponseをパースして返す', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    const result = await callGemini('system prompt', 'user prompt')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.response.market_assessment).toBe(VALID_GEMINI_JSON.market_assessment)
    expect(result.response.decisions).toHaveLength(2)
    expect(result.rawText).toBe(JSON.stringify(VALID_GEMINI_JSON))
  })

  it('正常応答時: usageMetadataからトークンカウントを取得する', async () => {
    const usage = { promptTokenCount: 500, candidatesTokenCount: 150, totalTokenCount: 650 }
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON, usage))

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.usage.promptTokens).toBe(500)
    expect(result.usage.candidateTokens).toBe(150)
    expect(result.usage.totalTokens).toBe(650)
  })

  it('コスト計算テスト: usageMetadata値からcostUsdが正しく計算される', async () => {
    const usage = { promptTokenCount: 1000, candidatesTokenCount: 500, totalTokenCount: 1500 }
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON, usage))

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const expectedCost =
      1000 * GEMINI_INPUT_PRICE_PER_TOKEN + 500 * GEMINI_OUTPUT_PRICE_PER_TOKEN
    expect(result.costUsd).toBeCloseTo(expectedCost, 10)
  })

  // -------------------------------------------------------------------------
  // Whitelist filtering (D-15)
  // -------------------------------------------------------------------------

  it('ホワイトリストフィルタ: 存在しない銘柄が除外される', async () => {
    const jsonWithUnknownTicker = {
      market_assessment: '市場安定',
      decisions: [
        {
          ticker: 'AAPL',
          action: 'BUY',
          quantity: 5,
          confidence: 'high',
          reasoning: '堅調。',
        },
        {
          ticker: 'UNKNOWN_TICKER',
          action: 'BUY',
          quantity: 10,
          confidence: 'high',
          reasoning: '不正な銘柄。',
        },
      ],
    }
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(jsonWithUnknownTicker))

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // filteredDecisions should not include UNKNOWN_TICKER
    const symbols = result.filteredDecisions.map((d) => d.ticker)
    expect(symbols).toContain('AAPL')
    expect(symbols).not.toContain('UNKNOWN_TICKER')
  })

  it('ホワイトリストフィルタ: 全銘柄がホワイトリスト内の場合は全件保持される', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.filteredDecisions).toHaveLength(2)
  })

  // -------------------------------------------------------------------------
  // Zod validation failure
  // -------------------------------------------------------------------------

  it('zodバリデーション失敗: 不正なJSON構造でok=falseを返す', async () => {
    const invalidJson = { wrong_field: 'invalid', no_decisions: [] }
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(invalidJson))

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toMatch(/validation_failed/)
  })

  it('zodバリデーション失敗: 不正なJSON文字列でok=falseを返す', async () => {
    const badResponse = {
      response: {
        text: () => 'not valid json {{{',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      },
    }
    mockGenerateContent.mockResolvedValueOnce(badResponse)

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeTruthy()
  })

  it('zodバリデーション失敗: rawTextはok=falseの場合でも返される', async () => {
    const invalidJson = { wrong: 'structure' }
    const rawStr = JSON.stringify(invalidJson)
    const badResponse = {
      response: {
        text: () => rawStr,
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      },
    }
    mockGenerateContent.mockResolvedValueOnce(badResponse)

    const result = await callGemini('system', 'user')

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.rawText).toBe(rawStr)
  })

  // -------------------------------------------------------------------------
  // Retry logic (D-14)
  // -------------------------------------------------------------------------

  it('リトライテスト: 1回目失敗→2回目成功', async () => {
    vi.useFakeTimers()

    mockGenerateContent
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    const resultPromise = callGemini('system', 'user')

    // advance 30 seconds to skip retry wait
    await vi.advanceTimersByTimeAsync(30_000)

    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('2回失敗テスト: 両方例外でok=false', async () => {
    vi.useFakeTimers()

    mockGenerateContent
      .mockRejectedValueOnce(new Error('First Error'))
      .mockRejectedValueOnce(new Error('Second Error'))

    const resultPromise = callGemini('system', 'user')

    // advance past the 30s retry wait
    await vi.advanceTimersByTimeAsync(30_000)

    const result = await resultPromise

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toMatch(/Second Error/)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Model configuration (D-05, D-07)
  // -------------------------------------------------------------------------

  it('responseMimeTypeが application/json に設定される', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    await callGemini('system', 'user')

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
      }),
    )
  })

  it('systemInstructionがsystemPromptで設定される', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    await callGemini('my system prompt', 'user prompt')

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: 'my system prompt',
      }),
    )
  })

  it('temperature=0.3 に設定される', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    await callGemini('system', 'user')

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          temperature: 0.3,
        }),
      }),
    )
  })

  it('generateContentがuserPromptで呼ばれる', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeMockResponse(VALID_GEMINI_JSON))

    await callGemini('system', 'my user prompt')

    expect(mockGenerateContent).toHaveBeenCalledWith('my user prompt')
  })
})
