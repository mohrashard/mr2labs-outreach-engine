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
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
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

  const openrouter = getOpenRouterClient();

  if (!openrouter) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured.');
  }

  // OpenRouter Primary: Llama 3.3 70B Free
  const PRIMARY_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
  // OpenRouter Secondary: Stick to free model
  const SECONDARY_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

  try {
    const response = await openrouter.chat.completions.create({
      model: PRIMARY_OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature,
    });
    const content = response.choices[0]?.message?.content;
    if (content) return cleanAndRepairJson(content);
  } catch (err: any) {
    console.warn(`[OpenRouter ${PRIMARY_OPENROUTER_MODEL} Error] Trying backup:`, err.message || err);
  }

  // Fallback
  try {
    const response = await openrouter.chat.completions.create({
      model: SECONDARY_OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature,
    });
    const content = response.choices[0]?.message?.content;
    if (content) return cleanAndRepairJson(content);
  } catch (err: any) {
    console.error(`[OpenRouter ${SECONDARY_OPENROUTER_MODEL} Error]:`, err.message || err);
  }

  throw new Error('All AI completion calls failed across OpenRouter endpoints.');
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