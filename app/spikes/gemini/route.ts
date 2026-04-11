import 'server-only'
import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
} from '@google/generative-ai'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 60

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

const getPriceDeclaration: FunctionDeclaration = {
  name: 'get_price',
  description: 'Get current stock price for a symbol',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      symbol: {
        type: SchemaType.STRING,
        description: 'Ticker symbol, e.g. AAPL',
      },
    },
    required: ['symbol'],
  },
}

const placeOrderDeclaration: FunctionDeclaration = {
  name: 'place_order',
  description: 'Place a virtual buy/sell/hold decision with reasoning',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      symbol: { type: SchemaType.STRING },
      action: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['BUY', 'SELL', 'HOLD'],
      },
      quantity: { type: SchemaType.INTEGER },
      reasoning: { type: SchemaType.STRING },
    },
    required: ['symbol', 'action', 'quantity', 'reasoning'],
  },
}

function runFakeTool(name: string, args: Record<string, unknown>) {
  if (name === 'get_price') {
    return {
      symbol: args.symbol,
      price: 150.0,
      currency: 'USD',
      date: '2026-04-11',
    }
  }
  if (name === 'place_order') {
    return { success: true, recorded: args }
  }
  return { error: 'unknown tool' }
}

export async function GET() {
  const startedAt = Date.now()
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [
        {
          functionDeclarations: [getPriceDeclaration, placeOrderDeclaration],
        },
      ],
      systemInstruction:
        'You are a virtual fund manager managing a JPY 10M portfolio. Use get_price to check the current price, then use place_order to record a BUY/SELL/HOLD decision with your reasoning.',
    })
    const chat = model.startChat()

    // Step 1: ask Gemini
    let result = await chat.sendMessage('What should we do with AAPL today?')
    const trace: Array<Record<string, unknown>> = []
    let safety = 0

    // Step 2: run function calls until the model returns plain text
    while (safety++ < 5) {
      const calls = result.response.functionCalls() ?? []
      if (calls.length === 0) break
      const functionResponses = calls.map((call) => {
        const output = runFakeTool(
          call.name,
          (call.args ?? {}) as Record<string, unknown>,
        )
        trace.push({ name: call.name, args: call.args, output })
        return {
          functionResponse: {
            name: call.name,
            response: output,
          },
        }
      })
      result = await chat.sendMessage(functionResponses as never)
    }

    return Response.json({
      sdk: 'gemini',
      model: 'gemini-2.5-flash',
      elapsedMs: Date.now() - startedAt,
      usage: result.response.usageMetadata ?? null,
      trace,
      finalText: result.response.text(),
    })
  } catch (error) {
    return Response.json(
      {
        sdk: 'gemini',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    )
  }
}
