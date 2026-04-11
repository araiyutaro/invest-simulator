import 'server-only'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '@/lib/env'

// Shared Gemini client for production use (Phase 3 Agent Pipeline).
// Decision: Selected @google/generative-ai after Phase 1 SPIKE.
// See .planning/research/AI-LAYER-SPIKE.md for measurements and rationale.
//
// Note: gemini-2.0-flash is no longer available to new API users as of
// 2026-04-11. Use gemini-2.5-flash which has equivalent free-tier limits
// and stable Function Calling support.
export const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

export const GEMINI_MODEL = 'gemini-2.5-flash'
