// lib/agent/gemini-caller.ts
// Phase 3 Agent Pipeline: Gemini API caller with retry, structured output, and cost estimation
// D-05: responseSchema JSON mode (no Function Calling)
// D-06: Single API call for all tickers
// D-14: 30s retry on error, fail after 2nd attempt
// D-15: Whitelist filter via findTicker()
// AGENT-07: Token cost estimation from usageMetadata

import 'server-only'
import { SchemaType } from '@google/generative-ai'
import { genAI, GEMINI_MODEL } from '@/lib/ai/client'
import { GeminiResponseSchema, estimateTokenCostUsd } from '@/lib/agent/types'
import type { GeminiResponse, GeminiDecisionItem } from '@/lib/agent/types'
import { findTicker } from '@/config/tickers'

// ---------------------------------------------------------------------------
// Response schema for Gemini structured output (D-07)
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    market_assessment: {
      type: SchemaType.STRING,
      description: '全体の市場環境分析（日本語）',
    },
    decisions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          ticker: { type: SchemaType.STRING },
          action: {
            type: SchemaType.STRING,
            description: 'One of: BUY, SELL, HOLD',
          },
          quantity: {
            type: SchemaType.INTEGER,
            description: '売買株数。HOLDの場合は0',
          },
          confidence: {
            type: SchemaType.STRING,
            description: 'One of: high, medium, low',
          },
          reasoning: {
            type: SchemaType.STRING,
            description: 'この判断の理由（日本語）',
          },
        },
        required: ['ticker', 'action', 'quantity', 'confidence', 'reasoning'],
      },
    },
  },
  required: ['market_assessment', 'decisions'],
}

// ---------------------------------------------------------------------------
// GeminiCallResult discriminated union
// ---------------------------------------------------------------------------

export type GeminiCallResult =
  | {
      ok: true
      response: GeminiResponse
      filteredDecisions: GeminiDecisionItem[]
      usage: {
        promptTokens: number
        candidateTokens: number
        totalTokens: number
      }
      costUsd: number
      rawText: string
    }
  | {
      ok: false
      error: string
      rawText?: string
    }

// ---------------------------------------------------------------------------
// callGemini — main entry point
// ---------------------------------------------------------------------------

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
): Promise<GeminiCallResult> {
  // Build model with structured output config (D-05, D-07)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.3,
    },
    systemInstruction: systemPrompt,
  })

  // Attempt API call with one retry on failure (D-14)
  let rawResult: Awaited<ReturnType<typeof model.generateContent>>

  try {
    rawResult = await model.generateContent(userPrompt)
  } catch (firstError) {
    // Wait 30 seconds before retry
    await new Promise((r) => setTimeout(r, 30_000))

    try {
      rawResult = await model.generateContent(userPrompt)
    } catch (secondError) {
      const message =
        secondError instanceof Error ? secondError.message : String(secondError)
      return { ok: false, error: message }
    }
  }

  // Extract raw text from response
  let rawText: string
  try {
    rawText = rawResult.response.text()
  } catch (textError) {
    const message = textError instanceof Error ? textError.message : String(textError)
    return { ok: false, error: `text_extraction_failed: ${message}` }
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { ok: false, error: `json_parse_failed: invalid JSON`, rawText }
  }

  // Zod validation (T-03-03, T-03-04 — STRIDE mitigations)
  const validation = GeminiResponseSchema.safeParse(parsed)
  if (!validation.success) {
    return {
      ok: false,
      error: `validation_failed: ${validation.error.message}`,
      rawText,
    }
  }

  const response = validation.data

  // Whitelist filtering (D-15) — exclude unknown tickers
  const filteredDecisions: GeminiDecisionItem[] = []
  for (const decision of response.decisions) {
    const ticker = findTicker(decision.ticker)
    if (!ticker) {
      console.warn(
        `[gemini-caller] Skipping decision for unlisted ticker: ${decision.ticker}`,
      )
      continue
    }
    filteredDecisions.push(decision)
  }

  // Extract token usage (AGENT-07)
  const usageMetadata = rawResult.response.usageMetadata ?? {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  }

  const promptTokens = usageMetadata.promptTokenCount ?? 0
  const candidateTokens = usageMetadata.candidatesTokenCount ?? 0
  const totalTokens = usageMetadata.totalTokenCount ?? 0

  const costUsd = estimateTokenCostUsd(promptTokens, candidateTokens)

  return {
    ok: true,
    response,
    filteredDecisions,
    usage: { promptTokens, candidateTokens, totalTokens },
    costUsd,
    rawText,
  }
}
