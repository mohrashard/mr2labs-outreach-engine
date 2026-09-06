// ==============================================================================
// MR² LABS OUTREACH ENGINE — GROQ DECISION MAKER EXTRACTOR (v1.0.0)
// Free tier LLaMA 3.3 (14,400 requests/day) for high-speed bio & team text parsing.
// ==============================================================================

import OpenAI from 'openai';
import { GROQ_MODELS, GEMINI_MODELS } from '../ai/models';

export interface GroqFounderExtraction {
  found: boolean;
  name: string | null;
  role: string | null;
  confidence: number;
  evidenceText: string | null;
}

/**
 * Parses raw text extracted from /about, /team, or legal pages to extract the true primary decision maker.
 * Dynamically adapts to any industry (Medical, Legal, Trades, SaaS, Real Estate, etc.).
 */
export async function extractFounderWithGroq(
  pageText: string,
  companyName: string,
  industry: string = 'business'
): Promise<GroqFounderExtraction | null> {
  if (!pageText || pageText.trim().length < 40) return null;

  const cleanedText = pageText.replace(/\s+/g, ' ').slice(0, 3000);

  const systemPrompt = `You are an expert data analyst extracting the primary decision maker from a company's website text.
The company is "${companyName}" and operates in the ${industry} industry.

Your task is to identify the HIGHEST ranking person mentioned (Owner, Founder, CEO, Managing Partner, Principal, Master Technician, Medical Director, Lead Attorney, etc.).
- Do NOT extract low-level employees, receptionists, office staff, or generic team members.
- If multiple leaders are listed, pick the primary Founder, Owner, or Managing Partner.
- If no specific human leader is identified, return found: false.

Return STRICT JSON matching this format:
{
  "found": boolean,
  "name": "First Last",
  "role": "Exact Title Found",
  "confidence": number,
  "evidenceText": "Short exact quote from the text proving this person is the leader"
}`;

  const userPrompt = `Target Company: "${companyName}"\nIndustry: "${industry}"\n\nWebsite Text to analyze:\n"""\n${cleanedText}\n"""`;

  // 1. Try Groq SDK (LLaMA 3.3 70B / GPT-OSS)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      // Use confirmed free-tier production models
      const models = [GROQ_MODELS.PRIMARY, GROQ_MODELS.FAST, GROQ_MODELS.FALLBACK];
      for (const model of models) {
        try {
          const response = await groq.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
            if (typeof parsed.found === 'boolean' && parsed.found && parsed.name) {
              return {
                found: true,
                name: parsed.name.trim(),
                role: parsed.role || 'OWNER',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 85,
                evidenceText: parsed.evidenceText || null,
              };
            } else {
              return {
                found: false,
                name: null,
                role: null,
                confidence: 0,
                evidenceText: null,
              };
            }
          }
        } catch (modelErr: any) {
          // If model is decommissioned or rate-limited, try next model in list
          continue;
        }
      }
    } catch (err: any) {
      console.warn('[Groq Extractor Warning]:', err?.message || err);
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
        model: GEMINI_MODELS.PRIMARY,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (typeof parsed.found === 'boolean' && parsed.found && parsed.name) {
          return {
            found: true,
            name: parsed.name.trim(),
            role: parsed.role || 'OWNER',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 85,
            evidenceText: parsed.evidenceText || null,
          };
        }
      }
    } catch (err: any) {
      console.warn('[Gemini Extractor Warning]:', err?.message || err);
    }
  }

  return null;
}
