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
  isTechnicalAudience?: boolean;
  rawAuditData?: Record<string, any>;
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

export function getNicheContext(nicheInput?: string): { niche: string; pains: string; solution: string; is_technical_audience?: boolean } {
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

export async function getNicheContextAsync(nicheInput?: string): Promise<{ niche: string; pains: string; solution: string; is_technical_audience?: boolean }> {
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
          solution: match.mr2_solution,
          is_technical_audience: match.is_technical_audience
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

function validateAndCleanBody(body: string): string | null {
  if (!body) return null;
  
  const mandatoryEnding = "so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard.";
  
  // Trim anything after the mandatory ending
  const endingIndex = body.indexOf(mandatoryEnding);
  if (endingIndex === -1) return null; // Reject entirely if ending is missing
  
  const cleaned = body.slice(0, endingIndex + mandatoryEnding.length).trim();
  
  // Reject if it's still multiple sentences before the hook
  const sentencesBefore = cleaned.split(/[.!?]/).filter(s => s.trim().length > 10);
  if (sentencesBefore.length > 2) return null; // Too many sentences, reject
  
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
    isTechnicalAudience?: boolean;
    rawAuditData?: Record<string, any>;
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

  // Pre-process raw audit data to extract only true/positive flags
  let flaggedOnly: Record<string, any> = {};
  if (extraParams?.rawAuditData) {
    for (const [key, value] of Object.entries(extraParams.rawAuditData)) {
      if (value === true || (typeof value === 'number' && value > 0) || (typeof value === 'string' && value.length > 0)) {
        flaggedOnly[key] = value;
      }
    }
  }

  const toneInstructions = nicheInfo.is_technical_audience
    ? `TECHNICAL AUDIENCE — Write engineer-to-engineer.
  - Name the specific vulnerability, CVE class, or performance metric directly
  - Acceptable terms: HSTS, DMARC, SPF, hydration payload, egress cost, clickjacking, DOM bloat
  - Impact clause must reference: infrastructure risk, security posture, or edge performance degradation
  - Example: "I noticed your frontend is serving a 240KB __NEXT_DATA__ hydration payload on every route and your headers are missing HSTS, creating both a performance bottleneck and a downgrade attack surface, so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard."`
    : `NON-TECHNICAL AUDIENCE — Translate every technical flaw into a business outcome.
  - BANNED words/acronyms: DMARC, SPF, HSTS, hydration, payload, CSP, header, SSL, HTTP, JSON
  - For each flaw type, use these plain-English translations:
      * dmarc_missing / spf_missing -> "your domain has no email authentication, meaning competitors can send fake emails pretending to be you"
      * hsts_missing / clickjacking_vulnerable -> "your site has a security gap that can expose your clients' browsers to attacks"
      * hydration_bloat_kb / html_size_kb -> "your website is sending massive amounts of hidden data overhead on every page load, severely slowing it down for mobile users"
      * missing_mobile_autocomplete -> "your contact forms are missing autocomplete, adding friction that causes mobile users to drop off before submitting"
      * has_scheduler (if false) -> "you have no automated booking system, meaning leads that visit after hours have no way to self-schedule"
  - Impact clause must reference: lost leads, wasted admin hours, missed revenue, or poor client trust`;

  const systemPrompt = `You are a cold email copywriter for MR² Labs. Your only job is to write exactly ONE sentence — the opening hook of a cold email — based on a JSON audit of the prospect's website.

## YOUR INPUTS
You will receive:
- A JSON object of audit flags. Each flag is either: boolean true/false, a numeric value, or a string.
- The prospect's niche and primary pain point.

## STEP 1 — SELECT THE SINGLE MOST CRITICAL FLAW
Scan the audit JSON. Select exactly ONE flaw using this strict priority hierarchy (top = highest priority):

TIER 1 — SECURITY & INFRASTRUCTURE (always leads if present):
  - dmarc_missing: true -> "no DMARC record protecting your domain from email spoofing"
  - spf_missing: true -> "no SPF record, leaving your domain open to spoofing"
  - hsts_missing: true -> "no HSTS header, exposing your site to downgrade attacks"
  - clickjacking_vulnerable: true -> "no X-Frame-Options header, leaving your site vulnerable to clickjacking"
  - caa_missing: true -> "no Certificate Authority Authorization, meaning any rogue CA can issue SSL certificates for your domain"
  - legacy_server_headers: (string) -> "your server is broadcasting outdated signatures like [VALUE]"

TIER 2 — PERFORMANCE & BLOAT (leads if no Tier 1 flaw):
  - hydration_bloat_kb > 150 -> "pulling a massive [VALUE]KB hydration payload on every route"
  - html_size_kb > 250 -> "your initial HTML payload is bloated to [VALUE]KB"
  - missing_cache_headers: true -> "your static assets are missing immutable cache headers"
  - has_tracker_bloat: true -> "heavy third-party trackers are blocking the main thread"

TIER 3 — CONVERSION & UX (leads if no Tier 1 or 2 flaw):
  - missing_mobile_autocomplete: true -> "intake forms are missing autocomplete"
  - has_scheduler: false -> "no automated appointment scheduler or booking widget"
  - missing_opengraph: true -> "missing Open Graph metadata, breaking social link previews"
  - has_mailto_trap: true -> "using outdated 'mailto:' links instead of proper lead capture forms"

CRITICAL RULE: Only reference a flaw if it is explicitly present in the JSON as \`true\`, as a string, or as a number exceeding the threshold above. If a key is absent, false, or null — it does not exist. Do NOT invent or assume any values.

## STEP 2 — WRITE EXACTLY ONE SENTENCE
Use this exact formula:
"I noticed [SPECIFIC FLAW WITH REAL DATA FROM JSON], [IMPACT CLAUSE], so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard."

The sentence must end with: "so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard."
This ending is MANDATORY and must be reproduced verbatim.

## STEP 3 — SPECIFICITY RULES
The flaw observation MUST include at least ONE of the following to feel credible:
- A real number from the audit JSON (KB, ms, a score)
- The domain name itself
- A specific page or feature ("your contact page", "your Instagram link in bio")

Generic = ignored. Specific = credible = replies.

BAD: "I noticed your site has security issues"
GOOD: "I noticed realtymiami.com has no DMARC record and your contact form loads in 4.8 seconds on mobile"

## STEP 4 — CURIOSITY GAP
The impact clause must create a knowledge gap — hint at MORE findings without revealing them.
Instead of: "which is costing you leads"
Use: "which is just one of 6 issues we flagged in the full diagnostic"

This forces them to open the PDF to see what else you found.

## TONE ROUTING
${toneInstructions}

## SUBJECT LINE
Write a subject line of exactly 1 to 4 words. No clickbait. No questions. State the flaw category or the audit offer plainly.
Good examples: "Site audit", "Security gap", "Load time issue", "Diagnostic for [Company]"
Bad examples: "You won't believe this", "Quick question", "Following up"

## OUTPUT FORMAT
Return ONLY this JSON object. No preamble. No explanation. No markdown fences.
{
  "email_subject": "1 to 4 word subject line",
  "generated_email_body": "The complete single sentence."
}

HARD CONSTRAINTS — violation of any of these is a failure:
1. generated_email_body must be exactly ONE sentence.
2. The sentence must end with the exact string: "so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard."
3. Do NOT add a greeting, sign-off, or second sentence under any circumstances.
4. Do NOT reference any flaw not present in the audit JSON as true or above threshold.
5. Do NOT use placeholder text like [Company Name] or [X seconds] — use real values from the JSON or the company name variable.`;

  const userPrompt = `Target Company Name: ${companyName}
Domain: ${domain}
Niche Pain Point: ${nicheInfo.pains}
Scraped Audit Data: ${JSON.stringify(flaggedOnly)}`;

  // 1. Try Groq (via OpenAI SDK)
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        const generated_email_body = validateAndCleanBody(parsed.generated_email_body);

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `1-Sentence Hook for ${companyName}`,
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

  // 2. Tier 2: Google AI Studio Direct (Gemini)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const gemini = new OpenAI({
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
      const completion = await gemini.chat.completions.create({
        model: 'gemini-3.7-flash',
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        const generated_email_body = validateAndCleanBody(parsed.generated_email_body);

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `1-Sentence Hook for ${companyName}`,
            generated_pitch: generated_email_body,
            audit_notes: `Target Niche: ${nicheInfo.niche} | Socials: ${socialPlatformsStr}`,
            pitch_text: generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] Gemini Error:', err?.message || err);
    }
  }

  // 3. Tier 3: Mistral AI (La Plateforme)
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    try {
      const mistral = new OpenAI({
        apiKey: mistralKey,
        baseURL: 'https://api.mistral.ai/v1',
      });
      const completion = await mistral.chat.completions.create({
        model: 'mistral-small-latest',
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        const generated_email_body = validateAndCleanBody(parsed.generated_email_body);

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `1-Sentence Hook for ${companyName}`,
            generated_pitch: generated_email_body,
            audit_notes: `Target Niche: ${nicheInfo.niche} | Socials: ${socialPlatformsStr}`,
            pitch_text: generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] Mistral Error:', err?.message || err);
    }
  }

  // 4. Tier 4: DeepSeek
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const deepseek = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com',
      });
      const completion = await deepseek.chat.completions.create({
        model: 'deepseek-v4-flash',
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        const generated_email_body = validateAndCleanBody(parsed.generated_email_body);

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `1-Sentence Hook for ${companyName}`,
            generated_pitch: generated_email_body,
            audit_notes: `Target Niche: ${nicheInfo.niche} | Socials: ${socialPlatformsStr}`,
            pitch_text: generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] DeepSeek Error:', err?.message || err);
    }
  }

  // 5. Tier 5: OpenRouter Fallback
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
        model: 'auto:free',
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        const generated_email_body = validateAndCleanBody(parsed.generated_email_body);

        if (generated_email_body) {
          return {
            email_subject,
            audit_summary: `1-Sentence Hook for ${companyName}`,
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

  // 6. Structured Static Fallback (1-Sentence Formula)
  const fallbackBody = `I noticed your site has a few missing security and performance configurations that are likely losing you conversions, so I ran a complete diagnostic audit on your business for free—take a look at the attached dashboard.`;

  return {
    email_subject: `Diagnostic for ${companyName}`,
    audit_summary: `1-Sentence SDR Pitch for ${companyName}`,
    generated_pitch: fallbackBody,
    audit_notes: `Target Niche: ${nicheInfo.niche}`,
    pitch_text: fallbackBody,
  };
}

export async function generateFollowUpPitch(
  previousPitchText: string,
  followUpStep: number, // 1, 2, or 3
  companyName: string,
  nicheInput?: string,
  founderName?: string | null,
  customPrompt?: string
): Promise<{ email_subject: string; generated_pitch: string }> {
  const nicheInfo = await getNicheContextAsync(nicheInput);
  
  const founderFirst = founderName ? founderName.split(' ')[0] : null;
  const greeting = founderFirst ? `Hi ${founderFirst},` : 'Hi,';

  let stepGoal = '';
  let stepRules = '';

  if (customPrompt && customPrompt.trim().length > 0) {
    stepGoal = `Follow custom user-defined instructions: ${customPrompt}`;
    stepRules = `Apply custom rules: ${customPrompt}`;
  } else if (followUpStep === 1) {
    stepGoal = 'Remind them without sounding desperate. Focus on the COST of the problem if it remains unsolved.';
    stepRules = `Sentence 1 (Reminder): A brief, polite reminder of the previous message. Do NOT just say "Following up."
Sentence 2 (The Cost): Explain what happens if they don't solve ${nicheInfo.pains} (e.g., lost projects, lost leads, wasted hours).
Sentence 3 (The Solution): Reiterate how MR² Labs solves this outcome.
Sentence 4 (The CTA): A low-friction ask for a 10-minute conversation.`;
  } else if (followUpStep === 2) {
    stepGoal = 'Change the angle. Introduce a new perspective (Revenue, Cost, Capacity, Speed, or Missed Opportunities).';
    stepRules = `Sentence 1 (New Angle): "One more thought on this: [Introduce a new insight/opportunity related to their niche]."
Sentence 2 (Alternative Perspective): "Rather than adding more work to your existing team or hiring internally, we can [specific outcome]."
Sentence 3 (The CTA): "If this is something you're considering, would you be open to a quick 10-minute chat?"`;
  } else {
    stepGoal = 'Close the loop, preserve the relationship, zero guilt-tripping. Do not ask for a meeting.';
    stepRules = `Sentence 1: "I'll close the loop here so I don't keep filling your inbox."
Sentence 2: "If solving ${nicheInfo.pains} becomes a priority in the future, I'd be happy to reconnect."
Sentence 3: "I'll keep your details on file. Wishing you and the team continued success."`;
  }

  const systemPrompt = `You are an elite B2B Sales Development Rep for MR² Labs. Your goal is to write Follow-Up #${followUpStep} to a ${nicheInfo.niche} business.
Do NOT say "Just checking in" or "Any updates?" or "Did you see my email?". Provide value.

STRICT WRITING RULES:
- Subject Line: Exactly 1 to 4 words. Keep it relevant to the follow-up or reply to previous.
- Greeting: "${greeting}"
- Length: STRICTLY 3 to 4 sentences total. Maximum 120 words.
- Tone: Professional, authoritative, zero guilt-tripping.
- Formatting: You MUST use double line breaks (\n\n) to create distinct paragraphs. Separate the greeting, the main body, and the CTA. Do NOT write a single block of text.
- Typography: Use standard keyboard hyphens (-). Absolutely NO em dashes (—), en dashes (–), or non-breaking hyphens (‑).

GOAL FOR THIS FOLLOW-UP:
${stepGoal}

FORMULA:
${stepRules}

Output valid JSON ONLY in this format:
{
  "email_subject": "1 to 4 words",
  "generated_email_body": "The complete 3-4 sentence email string"
}

CRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. You are returning raw text formatted as JSON only.`;

  const userPrompt = `Target Company Name: ${companyName}
Previous Email Sent: 
"${previousPitchText}"

Generate Follow-Up #${followUpStep} based on the strict formula.`;

  // 1. Try Groq (via OpenAI SDK)
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        if (parsed.generated_email_body) {
          return {
            email_subject: parsed.email_subject || 'Following up',
            generated_pitch: parsed.generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] Groq Error:', err?.message || err);
    }
  }

  // 2. Tier 2: Google AI Studio Direct (Gemini)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const gemini = new OpenAI({
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
      const completion = await gemini.chat.completions.create({
        model: 'gemini-3.7-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        if (parsed.generated_email_body) {
          return {
            email_subject: parsed.email_subject || 'Following up',
            generated_pitch: parsed.generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] Gemini Error:', err?.message || err);
    }
  }

  // 3. Tier 3: Mistral AI (La Plateforme)
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    try {
      const mistral = new OpenAI({
        apiKey: mistralKey,
        baseURL: 'https://api.mistral.ai/v1',
      });
      const completion = await mistral.chat.completions.create({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        if (parsed.generated_email_body) {
          return {
            email_subject: parsed.email_subject || 'Following up',
            generated_pitch: parsed.generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] Mistral Error:', err?.message || err);
    }
  }

  // 4. Tier 4: DeepSeek
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const deepseek = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com',
      });
      const completion = await deepseek.chat.completions.create({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        if (parsed.generated_email_body) {
          return {
            email_subject: parsed.email_subject || 'Following up',
            generated_pitch: parsed.generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] DeepSeek Error:', err?.message || err);
    }
  }

  // 5. Tier 5: OpenRouter Fallback
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
        model: 'auto:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(cleanAndRepairJson(content));
        if (parsed.generated_email_body) {
          return {
            email_subject: parsed.email_subject || 'Following up',
            generated_pitch: parsed.generated_email_body,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] OpenRouter Error:', err?.message || err);
    }
  }

  // 6. Static Fallback
  let fallbackBody = '';
  if (followUpStep === 1) {
    fallbackBody = `${greeting}\n\nJust following up on my previous message. One thing we've seen with ${nicheInfo.niche} businesses is that ${nicheInfo.pains} becomes increasingly expensive as the business grows.\n\nThat's exactly where we help by delivering systems that ${nicheInfo.solution}.\n\nWould a quick 10-minute conversation this week be worth exploring?`;
  } else if (followUpStep === 2) {
    fallbackBody = `${greeting}\n\nOne more thought on this: you may already have the infrastructure in place, the challenge is often the operational friction behind it.\n\nRather than adding more manual work to your existing team, we can ${nicheInfo.solution}.\n\nIf this is something you're considering, would you be open to a quick 10-minute chat?`;
  } else {
    fallbackBody = `${greeting}\n\nI'll close the loop here so I don't keep filling your inbox.\n\nIf overcoming issues with ${nicheInfo.pains} becomes a priority in the future, I'd be happy to reconnect and explore what we could build around it.\n\nI'll keep your details on file. Wishing you and the team continued success.`;
  }

  return {
    email_subject: followUpStep === 3 ? 'Closing the loop' : 'Following up',
    generated_pitch: fallbackBody,
  };
}
