import OpenAI from 'openai';

export interface AuditResult {
  audit_notes: string;
  pitch_text: string;
}

export type ResponseIntent = 'INTERESTED' | 'NOT_INTERESTED' | 'OUT_OF_OFFICE';

function cleanAndRepairJson(str: string): string {
  let cleaned = str
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // If response truncated missing closing brace, append it
  if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
    cleaned += '}';
  }

  return cleaned;
}

function getGroqClient(): OpenAI | null {
  if (!process.env.GROQ_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

function getOpenRouterClient(): OpenAI | null {
  if (!process.env.OPEN_ROUTER_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'MR2 Labs Cold Engine',
    },
  });
}

async function callAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<string> {
  const groq = getGroqClient();

  if (groq) {
    try {
      const guardedSystemPrompt = `${systemPrompt}\n\nCRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. Return RAW JSON ONLY.`;
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: guardedSystemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return cleanAndRepairJson(content);
    } catch (err: any) {
      console.warn(`[Groq Error] Trying backup:`, err.message || err);
    }
  }

  // 2. Tier 2 Fallback: Google AI Studio Direct (Gemini)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const gemini = new OpenAI({
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
      const response = await gemini.chat.completions.create({
        model: 'gemini-3.7-flash',
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nCRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. Return RAW JSON ONLY.` },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return cleanAndRepairJson(content);
    } catch (err: any) {
      console.warn('[Gemini Error] Trying backup:', err.message || err);
    }
  }

  // 3. Tier 3 Fallback: Mistral AI (La Plateforme)
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    try {
      const mistral = new OpenAI({
        apiKey: mistralKey,
        baseURL: 'https://api.mistral.ai/v1',
      });
      const response = await mistral.chat.completions.create({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nCRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. Return RAW JSON ONLY.` },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return cleanAndRepairJson(content);
    } catch (err: any) {
      console.warn('[Mistral Error] Trying backup:', err.message || err);
    }
  }

  // 4. Tier 4 Fallback: DeepSeek
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const deepseek = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com',
      });
      const response = await deepseek.chat.completions.create({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nCRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. Return RAW JSON ONLY.` },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return cleanAndRepairJson(content);
    } catch (err: any) {
      console.warn('[DeepSeek Error] Trying backup:', err.message || err);
    }
  }

  // 5. Tier 5 Fallback: OpenRouter (Last Resort)
  const openrouter = getOpenRouterClient();
  if (openrouter) {
    try {
      const response = await openrouter.chat.completions.create({
        model: 'auto:free',
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nCRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. Return RAW JSON ONLY.` },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return cleanAndRepairJson(content);
    } catch (err: any) {
      console.error('[OpenRouter Error]:', err.message || err);
    }
  }

  throw new Error('All AI completion calls failed across Groq, Gemini, Mistral, DeepSeek, and OpenRouter endpoints.');
}

export async function generateLeadAuditAndPitch(
  companyName: string,
  siteText: string
): Promise<AuditResult> {
  const systemPrompt = `Act as an MR² Labs conversion architect. Analyze the site text and return valid JSON with key names "audit_notes" and "pitch_text". Do NOT wrap output in markdown syntax. Keep pitch under 40 words.

- "audit_notes": Highlight exactly 1 concrete technical flaw found in or implied by the site text.
- "pitch_text": Provide a concise 2-sentence direct solution offering a modern custom build.`;

  const maxTextLength = 2500;
  const truncatedSiteText =
    siteText.length > maxTextLength
      ? siteText.substring(0, maxTextLength)
      : siteText;

  const userPrompt = `Company Name: ${companyName}\n\nSite Text:\n${truncatedSiteText}`;

  const content = await callAIWithFallback(systemPrompt, userPrompt, 0.3);

  try {
    const parsed = JSON.parse(content) as AuditResult;
    return parsed;
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', content);
    throw new Error('Invalid JSON returned from AI provider');
  }
}

export async function classifyEmailResponse(
  emailText: string
): Promise<ResponseIntent> {
  const systemPrompt = `Analyze the provided email response from a lead. Classify intent as "INTERESTED", "NOT_INTERESTED", or "OUT_OF_OFFICE". Return a JSON object with key "intent".`;

  const userPrompt = `Email Text:\n${emailText.substring(0, 3000)}`;

  const content = await callAIWithFallback(systemPrompt, userPrompt, 0.1);

  try {
    const parsed = JSON.parse(content);
    const intent = parsed.intent as ResponseIntent;
    if (['INTERESTED', 'NOT_INTERESTED', 'OUT_OF_OFFICE'].includes(intent)) {
      return intent;
    }
    return 'INTERESTED';
  } catch (error) {
    console.error('Failed to parse classification JSON:', content);
    return 'INTERESTED';
  }
}