/**
 * AI Models Registry & Configuration
 * 
 * Sourced from live official documentation (Sep 2026):
 * - Groq: console.groq.com/docs/models
 * - Google Gemini: ai.google.dev/gemini-api/docs/rate-limits
 * - Mistral: console.mistral.ai
 * - DeepSeek: api.deepseek.com
 * - OpenRouter: openrouter.ai/models?max_price=0
 */

export const GROQ_MODELS = {
  /** Primary production model: high quality JSON extraction & reasoning (~500 tps, 131k ctx) */
  PRIMARY: 'openai/gpt-oss-120b',
  /** Ultra-fast extraction, classification & bouncer checks (~1000 tps, 131k ctx) */
  FAST: 'openai/gpt-oss-20b',
  /** High-volume fallback model (~560 tps) */
  FALLBACK: 'llama-3.1-8b-instant',
  /** High-capability structured parser */
  VERSATILE: 'llama-3.3-70b-versatile',
} as const;

export const GEMINI_MODELS = {
  /** Confirmed free tier primary: 10 RPM, 250 RPD, 250,000 TPM */
  PRIMARY: 'gemini-2.5-flash',
  /** High-volume free tier model: 15 RPM, 1,000 RPD, 250,000 TPM */
  FLASH_LITE: 'gemini-2.5-flash-lite',
  /** Deep audit model: 5 RPM, 100 RPD */
  PRO: 'gemini-2.5-pro',
} as const;

export const MISTRAL_MODELS = {
  /** Experiment free tier primary: 2 RPM, 1B tokens/mo */
  PRIMARY: 'mistral-small-latest',
  /** Flagship model */
  LARGE: 'mistral-large-latest',
  /** Free agentic coding model ($0.00 / 1M tokens) */
  DEVSTRAL: 'devstral-small-latest',
} as const;

export const DEEPSEEK_MODELS = {
  /** Primary active production model ($0.14 in / $0.28 out, 1M context) */
  PRIMARY: 'deepseek-v4-flash',
  /** Active flagship model ($0.435 in / $0.87 out) */
  PRO: 'deepseek-v4-pro',
} as const;

export const OPENROUTER_MODELS = {
  /** Top quality ranked free model (256K context, tools) */
  PRIMARY_FREE: 'z-ai/glm-5.2:free',
  /** High-context free model (1M context, vision + tools) */
  MINIMAX_FREE: 'minimax/minimax-m3:free',
  /** Google Gemma open weights (262K context) */
  GEMMA_FREE: 'google/gemma-4-31b-it:free',
  /** OpenRouter automatic free meta-router */
  AUTO_FREE: 'openrouter/free',
} as const;

/**
 * Standard Cascade Configuration for Text Extraction and Audits
 */
export const MODEL_CASCADE = {
  TIER_1_GROQ: GROQ_MODELS.PRIMARY,
  TIER_1_GROQ_FAST: GROQ_MODELS.FAST,
  TIER_2_GEMINI: GEMINI_MODELS.PRIMARY,
  TIER_3_MISTRAL: MISTRAL_MODELS.PRIMARY,
  TIER_4_DEEPSEEK: DEEPSEEK_MODELS.PRIMARY,
  TIER_5_OPENROUTER: OPENROUTER_MODELS.PRIMARY_FREE,
} as const;
