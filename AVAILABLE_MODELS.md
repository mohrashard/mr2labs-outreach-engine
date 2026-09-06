# Available AI Models & Free Tier Registry
*Last Updated: September 2026 (Live official documentation from Groq, Google AI Studio, Mistral, OpenRouter, and DeepSeek)*

---

## 🟣 Groq — Production Models (console.groq.com/docs/models)

All models available on free tier (rate-limited: ~30 req/min, daily token caps).

### Confirmed Production Models (Free Tier):
| Model ID | Speed | Price (Paid) | Context | Best Use Case |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | ~500 tps | $0.15 in / $0.60 out | 131K | **Primary Engine**: Highest quality reasoning & JSON extraction |
| `openai/gpt-oss-20b` | ~1000 tps | $0.075 in / $0.30 out | 131K | Ultra-fast extraction, classification & bouncer checks |
| `llama-3.1-8b-instant` | ~560 tps | Enterprise tier | 131K | High-volume speed fallback |
| `llama-3.3-70b-versatile`| ~280 tps | Enterprise tier | 131K | High-capability structured parsing |

### Audio Models:
- `whisper-large-v3` ($0.111/hr)
- `whisper-large-v3-turbo` ($0.04/hr)

### ⚠️ Preview / Rotating Models (DO NOT USE in production):
- `openai/gpt-oss-safeguard-20b` (safety classifier only)
- `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`
- `kimi-k2-instruct`, `llama-4-scout`, `qwen3-32b` (unstable / rotating preview models)

> **Groq Recommendation for Stack**:
> Default to `openai/gpt-oss-120b` and `openai/gpt-oss-20b`. Fall back to `llama-3.1-8b-instant` for high-throughput tasks.

---

## 🔵 Google Gemini — Official AI Studio Free Tier (ai.google.dev)
*Updated September 2, 2026*

| Model | RPM | TPM | RPD | Status & Guidance |
|---|---|---|---|---|
| `gemini-2.5-flash` | 10 | 250,000 | 250 | **SAFE PRIMARY FREE MODEL**: Excellent speed, high accuracy |
| `gemini-2.5-flash-lite` | 15 | 250,000 | 1,000 | **SAFE HIGH-VOLUME FREE MODEL**: Best for bulk qualification |
| `gemini-2.5-pro` | 5 | 250,000 | 100 | Complex audits / deep analysis (strict 100/day cap) |
| `gemma-3` / `gemma-3n` | 30 | 15,000 | 14,400 | Open weights fallback |
| `gemini-embedding` | 100 | 30,000 | 1,000 | Semantic vector search |

### ⚠️ Gemini Models to AVOID:
- **Gemini 3.x models (`gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`)**: NOT in free tier rate limits table. Paid-only or zero free tier quota.
- **`gemini-2.0-flash` & `gemini-2.0-flash-lite`**: Deprecated / shutdown (shut down June/October 2026 on Firebase/Vertex).

> **Gemini Recommendation for Stack**:
> Always use `gemini-2.5-flash` for Tier 2 fallback. Use `gemini-2.5-flash-lite` if exceeding RPD quotas.

---

## 🟡 Mistral AI — Experiment (Free) Tier (console.mistral.ai)

Mistral La Plateforme offers an **Experiment (Free) Tier**:
- Rate limit: **2 RPM**, ~1 Billion tokens/month cap.
- No credit card required.

| Model ID | Details |
|---|---|
| `mistral-small-latest` | Small 4 (hybrid MoE, reasoning, fast JSON) — **Best for Tier 3** |
| `mistral-large-latest` | Mistral Large 3 flagship |
| `mistral-medium-latest`| Medium 3.5 (multimodal & agents) |
| `devstral-small-latest`| Dedicated agentic coding ($0.00 in / $0.00 out) |
| `codestral-latest` | Code specialist |

### ⚠️ Mistakes to Avoid:
- Do NOT hardcode date pins like `mistral-small-2506` or outdated versions. Always use `-latest` tags (`mistral-small-latest`).
- Keep request concurrency strictly serialized due to the 2 RPM free ceiling.

---

## 🔴 OpenRouter — Free Models (openrouter.ai)
*Active as of September 2026*

Free tier limits: **20 requests/minute**, **200 requests/day per model**. No credit card needed.

### Top Models (Ranked by Quality & Capability):
1. `z-ai/glm-5.2:free` (256K context, Tools)
2. `minimax/minimax-m3:free` (1M context, Vision + Tools)
3. `thinkingmachines/inkling-small:free` (1M context, Vision + Tools + Reasoning)
4. `thinkingmachines/inkling:free` (1M context, Vision + Tools + Reasoning)
5. `nvidia/nemotron-3-ultra-550b-a55b:free` (1M context, Tools)
6. `google/gemma-4-31b-it:free` (262K context, Vision + Tools)
7. `openrouter/free` (200K context, meta-router)

### ⚠️ OpenRouter Guidance:
- 200 req/day is a hard ceiling.
- Use ONLY as Tier 5 last-resort fallback.
- Avoid stale tags like `meta-llama/llama-3.3-70b-instruct:free` when unlisted.

---

## 🟢 DeepSeek API (api.deepseek.com)

DeepSeek provides a **one-time 5M token grant** upon account creation (no card). Afterwards, it is pay-as-you-go (low cost, but NOT perpetually free).

| Model ID | Context | Price / 1M tokens | Status |
|---|---|---|---|
| `deepseek-v4-flash` | 1M | $0.14 in / $0.28 out | Active production |
| `deepseek-v4-pro` | 1M | $0.435 in / $0.87 out | Active flagship |

### ⚠️ CRITICAL DEPRECATION:
- `deepseek-chat` and `deepseek-reasoner` aliases were **RETIRED July 24, 2026**.
- Calling `deepseek-chat` will fail or trigger legacy errors. Always use `deepseek-v4-flash`.

---

## 🏗️ Architecture Fallback Strategy

When configuring LLM providers across the codebase, always follow this priority order:

```
Tier 1: Groq (`openai/gpt-oss-120b` or `openai/gpt-oss-20b`)
  │ (Free, ultra-low latency, 30 RPM)
  ▼
Tier 2: Google Gemini (`gemini-2.5-flash`)
  │ (Free, 10 RPM, 250 RPD)
  ▼
Tier 3: Mistral AI (`mistral-small-latest` or `devstral-small-latest`)
  │ (Free, 2 RPM experiment tier)
  ▼
Tier 4: DeepSeek (`deepseek-v4-flash`)
  │ (5M token grant / low-cost paid)
  ▼
Tier 5: OpenRouter (`z-ai/glm-5.2:free` or `openrouter/free`)
  │ (Free, 200 RPD emergency fallback)
  ▼
Deterministic Fallback (100% Safe Template Engine)
```
