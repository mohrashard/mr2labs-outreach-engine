import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface AuditResult {
  email_subject: string;
  audit_summary: string;
  generated_pitch: string;
  audit_notes?: string;
  pitch_text?: string;
}

export interface PitchGenerationParams {
  companyName: string;
  domain: string;
  domSnippet?: string;
  nicheInput?: string;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  founderName?: string | null;
}

export const NICHE_TEMPLATES: Record<string, { pains: string; solution: string }> = {
  "Real Estate Agency": {
    pains: "inquiries from websites and social media aren't followed up with instantly",
    solution: "capture, qualify, and follow up with high-intent leads automatically 24/7"
  },
  "Law Firm": {
    pains: "potential clients drop off due to slow, manual intake forms on mobile",
    solution: "automate client onboarding and case qualification instant response systems"
  },
  "E-Commerce": {
    pains: "high cart abandonment and slow page loads hurt customer acquisition",
    solution: "deploy instant-load custom storefronts with automated cart recovery workflows"
  },
  "Dental Practice": {
    pains: "patient appointment requests sit unconfirmed after business hours",
    solution: "schedule, confirm, and follow up with patient bookings autonomously"
  },
  "General B2B": {
    pains: "qualified inbound opportunities slip through the cracks during busy operational hours",
    solution: "engineer high-converting custom client portals and automated lead capture pipelines"
  }
};

export function getNicheContext(nicheInput?: string): { niche: string; pains: string; solution: string } {
  if (!nicheInput) {
    return { niche: "General B2B", ...NICHE_TEMPLATES["General B2B"] };
  }
  
  const key = Object.keys(NICHE_TEMPLATES).find(
    k => k.toLowerCase() === nicheInput.toLowerCase() || nicheInput.toLowerCase().includes(k.toLowerCase())
  );

  if (key) {
    return { niche: key, ...NICHE_TEMPLATES[key] };
  }

  return { 
    niche: nicheInput, 
    pains: `inbound leads and inquiries for ${nicheInput} aren't followed up with immediately`,
    solution: `build custom automated systems to capture, qualify, and convert ${nicheInput} opportunities 24/7`
  };
}

export async function getNicheContextAsync(nicheInput?: string): Promise<{ niche: string; pains: string; solution: string }> {
  const defaultNiche = nicheInput || "General B2B";

  try {
    const { data: templates } = await supabaseAdmin.from('pitch_templates').select('*');
    if (templates && templates.length > 0) {
      const match = templates.find(
        (t: any) => t.niche_name.toLowerCase() === defaultNiche.toLowerCase() ||
             t.niche_name.toLowerCase().includes(defaultNiche.toLowerCase()) ||
             defaultNiche.toLowerCase().includes(t.niche_name.toLowerCase())
      );
      if (match) {
        return {
          niche: match.niche_name,
          pains: match.pain_points,
          solution: match.mr2_solution
        };
      }
    }
  } catch (err) {
    console.warn('[AI Pitch] Supabase pitch_templates fetch warning, using static matrix:', err);
  }

  return getNicheContext(nicheInput);
}

function cleanAndRepairJson(rawText: string): string {
  let cleaned = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
    cleaned += '}';
  }
  return cleaned;
}

export async function generateAuditAndPitch(
  companyName: string, 
  domain: string, 
  domSnippet?: string,
  nicheInput?: string,
  extraParams?: {
    linkedinUrl?: string | null;
    instagramUrl?: string | null;
    founderName?: string | null;
  }
): Promise<AuditResult> {
  const nicheInfo = await getNicheContextAsync(nicheInput);

  // Determine active social platforms
  const socials: string[] = [];
  if (extraParams?.instagramUrl) socials.push('Active on Instagram');
  if (extraParams?.linkedinUrl) socials.push('Active on LinkedIn');
  const socialPlatformsStr = socials.length > 0 ? socials.join(', ') : 'No social profile linked';

  // Construct website snippet note
  const cleanedSnippet = domSnippet && domSnippet.trim().length >= 50
    ? domSnippet.trim().slice(0, 2500)
    : 'Website is missing or lacks text content (Google search result entry).';

  const founderFirst = extraParams?.founderName 
    ? extraParams.founderName.split(' ')[0]
    : null;

  const systemPrompt = `You are an elite B2B Sales Development Rep for MR² Labs. Your goal is to write a highly personalized, low-friction cold email to a ${nicheInfo.niche} business. 
Do NOT explain what MR² Labs is. Do NOT list our technology stack (React, Python, Next.js, Supabase, etc.). 
Focus purely on a business outcome.

STRICT WRITING RULES:
- Subject Line: Exactly 1 to 4 words. No clickbait.
- Greeting: "Hi ${founderFirst || ''}," (if founder first name is provided) or "Hi," (if founder name is unknown).
- Length: STRICTLY 4 sentences total. Maximum 150 words.

EMAIL FORMULA:
Sentence 1 (Observation): Prove you looked at them. Use the scraped text or social links to make a real observation. (e.g., "I came across ${companyName} and noticed [specific detail about their site or online presence].")
Sentence 2 (The Problem): Frame the pain point generally. Do NOT say "You are losing leads." Say "${nicheInfo.niche} teams often lose opportunities when ${nicheInfo.pains}."
Sentence 3 (The Outcome): State what our system does. "At MR² Labs, we build custom systems that ${nicheInfo.solution}."
Sentence 4 (The CTA): Ultra low-friction ask. "Worth a quick 10-minute conversation this week?" or "Open to a quick 10-minute chat?"

Output valid JSON ONLY in this format:
{
  "email_subject": "1 to 4 words",
  "generated_email_body": "The complete 4-sentence email string"
}`;

  const userPrompt = `Target Company Name: ${companyName}
Domain: ${domain}
Scraped Website Text: ${cleanedSnippet}
Available Socials: ${socialPlatformsStr}
Founder Name: ${extraParams?.founderName || 'Unknown'}
Niche Pain Point: ${nicheInfo.pains}
MR² Labs System Outcome: ${nicheInfo.solution}`;

  // 1. Try Groq (via OpenAI SDK)
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        const email_subject = parsed.email_subject || `Question for ${companyName}`;
        const generated_email_body = parsed.generated_email_body || parsed.generated_pitch || parsed.pitch_text;

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `4-Sentence SDR Pitch for ${companyName}`,
            generated_pitch: generated_email_body,
            audit_notes: `Target Niche: ${nicheInfo.niche} | Socials: ${socialPlatformsStr}`,
            pitch_text: generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] Groq Error:', err?.message || err);
    }
  } else {
    console.warn('[AI Pitch] GROQ_API_KEY is missing from environment variables');
  }

  // 2. OpenRouter Fallback
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
  if (openRouterKey) {
    try {
      const openrouter = new OpenAI({
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'MR2 Outreach Engine',
        },
      });

      const completion = await openrouter.chat.completions.create({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        const email_subject = parsed.email_subject || `Question for ${companyName}`;
        const generated_email_body = parsed.generated_email_body || parsed.generated_pitch || parsed.pitch_text;

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `4-Sentence SDR Pitch for ${companyName}`,
            generated_pitch: generated_email_body,
            audit_notes: `Target Niche: ${nicheInfo.niche} | Socials: ${socialPlatformsStr}`,
            pitch_text: generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] OpenRouter Error:', err?.message || err);
    }
  }

  // 3. Structured Static Fallback (4-Sentence SDR Formula)
  const greeting = founderFirst ? `Hi ${founderFirst},` : 'Hi,';
  const sentence1 = `I came across ${companyName} while reviewing ${nicheInfo.niche} operations in your market.`;
  const sentence2 = `${nicheInfo.niche} teams often lose high-intent opportunities when ${nicheInfo.pains}.`;
  const sentence3 = `At MR² Labs, we build custom systems that ${nicheInfo.solution}.`;
  const sentence4 = `Open to a quick 10-minute conversation this week?`;

  const fallbackBody = `${greeting}\n\n${sentence1} ${sentence2} ${sentence3} ${sentence4}`;

  return {
    email_subject: `Question for ${companyName}`,
    audit_summary: `4-Sentence SDR Pitch for ${companyName}`,
    generated_pitch: fallbackBody,
    audit_notes: `Target Niche: ${nicheInfo.niche}`,
    pitch_text: fallbackBody,
  };
}
