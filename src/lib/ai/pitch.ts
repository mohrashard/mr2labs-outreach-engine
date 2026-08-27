import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeGreetingAndBody } from '@/lib/email/formatter';

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

export const MR2_SERVICES = {
  WEBSITE_REBUILD: {
    name: "Website Redesign & Conversion",
    outcome: "turn the website into a faster, modern conversion-focused experience"
  },
  AI_AUTOMATION: {
    name: "AI Lead Automation",
    outcome: "automate repetitive lead and customer workflows"
  },
  CUSTOM_SOFTWARE: {
    name: "Custom Business Software",
    outcome: "replace manual workflows with custom software built around your operations"
  },
  SECURITY_REMEDIATION: {
    name: "Website Security Remediation",
    outcome: "remediate security weaknesses and perform a broader technical hardening"
  },
  PERFORMANCE: {
    name: "Website Performance Optimization",
    outcome: "optimize the site's loading speed and Core Web Vitals"
  },
  WHITE_LABEL: {
    name: "White-Label Engineering",
    outcome: "provide your agency with additional technical capacity without internal hiring"
  }
};

export interface AuditResult {
  email_subject: string;
  audit_summary: string;
  generated_pitch: string;
  audit_notes?: string;
  pitch_text?: string;
  audit_finding?: string;
  business_impact?: string;
  recommended_service?: string;
  service_pitch?: string;
  error?: string;
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
  - Example output: "the site is serving a 240KB __NEXT_DATA__ hydration payload on every route and missing HSTS, creating a performance bottleneck and security risk"`
    : `NON-TECHNICAL AUDIENCE — Translate every technical flaw into a business outcome.
  - BANNED words/acronyms: DMARC, SPF, HSTS, hydration, payload, CSP, header, SSL, HTTP, JSON
  - For each flaw type, use these plain-English translations:
      * dmarc_missing / spf_missing -> "the domain has no email authentication, meaning competitors can send fake emails pretending to be you"
      * hsts_missing / clickjacking_vulnerable -> "the site has a security gap that can expose your clients' browsers to attacks"
      * hydration_bloat_kb / html_size_kb -> "the website is sending massive amounts of hidden data on every page load, severely slowing it down for mobile users"
      * missing_mobile_autocomplete -> "contact forms are missing autocomplete, adding friction that causes mobile users to drop off before submitting"
      * missing_scheduler -> "there is no automated booking system, meaning leads that visit after hours have no way to self-schedule"
      * is_diy_subdomain -> "the business is running on a free DIY subdomain or template builder, which limits local SEO ranking and restricts custom automation workflows"`;

  const systemPrompt = `You are an elite consultative sales agent for Mr² Labs. Your job is to analyze a JSON audit of a prospect's website and select the MOST COMMERCIALLY RELEVANT service to pitch them.

## SERVICE CATALOG
Use this exact catalog to map findings to the primary Mr² Service:
- WEBSITE_REBUILD: name: "Website Redesign & Conversion", outcome: "turn the website into a faster, modern conversion-focused experience". Triggered when is_diy_subdomain is present, or html_size_kb is extremely high.
- AI_AUTOMATION: name: "AI Lead Automation", outcome: "automate repetitive lead and customer workflows". Triggered when missing_whatsapp, missing_scheduler, missing_live_chat, or missing_crm are present
- CUSTOM_SOFTWARE: name: "Custom Business Software", outcome: "replace manual workflows with custom software built around your operations". Triggered when missing_crm + missing_payment together, or the niche is operations-heavy (law, dental, real estate)
- SECURITY_REMEDIATION: name: "Website Security Remediation", outcome: "remediate security weaknesses and perform a broader technical hardening"
- PERFORMANCE: name: "Website Performance Optimization", outcome: "optimize the site's loading speed and Core Web Vitals"
- WHITE_LABEL: name: "White-Label Engineering", outcome: "provide your agency with additional technical capacity without internal hiring"

## CRITICAL RULE FOR NO FINDINGS
If the JSON audit is empty, or all values are false/null/0, you MUST return exactly:
{ "error": "The automated audit could not generate a verified finding." }
Do not invent problems.

## STEP 1 — SELECT THE PRIMARY FLAW & SERVICE
Scan the audit JSON. Select exactly ONE primary flaw. Map it to the exact service name from the catalog above.

## STEP 2 — GENERATE THE EMAIL BODY
Write a clean, double-spaced 4-sentence cold email using this exact formula:
1. Greeting: If Founder First Name is provided, start with "Hi [First Name],". Otherwise start with "Hi,". NEVER use bracket placeholders like [First Name] or corporate names.
2. Observation & Problem: "I ran a quick technical check on your website and noticed [finding]. This can [business impact]."
3. Pitch: "I've attached a quick audit highlighting what we found. Mr² Labs can [service outcome]."
4. CTA: "Would you be open to a quick 10-minute conversation?"
5. Sign-off: "Best,\nRashard"

CRITICAL PARAGRAPH FORMATTING RULE:
You MUST separate each paragraph with double line breaks (\n\n). Do NOT write a single wall of text.

## OUTPUT FORMAT
Return ONLY this JSON object. No preamble.
{
  "email_subject": "1 to 4 word subject line",
  "audit_finding": "The specific technical finding",
  "business_impact": "The business consequence",
  "recommended_service": "The exact service name from the catalog",
  "service_pitch": "The Mr² Labs can... pitch",
  "email_body": "Hi [Name],\n\nI ran a quick technical check on your website...\n\nI've attached a quick audit...\n\nWould you be open to a quick 10-minute conversation?\n\nBest,\nRashard"
}

HARD CONSTRAINTS:
1. Do NOT use placeholder text like [First Name] or [Company Name] — use real names or clean fallbacks like "Hi,".
2. Only reference a flaw if it is explicitly present in the JSON as true or above threshold.`;

  const founderFirstStr = founderFirst ? `Founder First Name: ${founderFirst}` : `Founder Name: None (Use "Hi,")`;

  const userPrompt = `Target Company Name: ${companyName}
Domain: ${domain}
${founderFirstStr}
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
        if (parsed.error) {
          return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
        }
        if (parsed.audit_finding && parsed.email_body) {
          const sanitizedBody = sanitizeGreetingAndBody(parsed.email_body, extraParams?.founderName, companyName);
          return {
            email_subject,
            audit_summary: `Audit Pitch for ${companyName}`,
            generated_pitch: sanitizedBody,
            audit_notes: JSON.stringify({
              finding: parsed.audit_finding,
              impact: parsed.business_impact,
              service: parsed.recommended_service || 'Consultation',
              pitch: parsed.service_pitch
            }),
            pitch_text: sanitizedBody,
            audit_finding: parsed.audit_finding,
            business_impact: parsed.business_impact,
            recommended_service: parsed.recommended_service,
            service_pitch: parsed.service_pitch,
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
        if (parsed.error) {
          return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
        }
        if (parsed.audit_finding && parsed.email_body) {
          const sanitizedBody = sanitizeGreetingAndBody(parsed.email_body, extraParams?.founderName, companyName);
          return {
            email_subject,
            audit_summary: `Audit Pitch for ${companyName}`,
            generated_pitch: sanitizedBody,
            audit_notes: JSON.stringify({
              finding: parsed.audit_finding,
              impact: parsed.business_impact,
              service: parsed.recommended_service || 'Consultation',
              pitch: parsed.service_pitch
            }),
            pitch_text: sanitizedBody,
            audit_finding: parsed.audit_finding,
            business_impact: parsed.business_impact,
            recommended_service: parsed.recommended_service,
            service_pitch: parsed.service_pitch,
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
        model: 'mistral-small-2506',
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
        if (parsed.error) {
          return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
        }
        if (parsed.audit_finding && parsed.email_body) {
          const sanitizedBody = sanitizeGreetingAndBody(parsed.email_body, extraParams?.founderName, companyName);
          return {
            email_subject,
            audit_summary: `Audit Pitch for ${companyName}`,
            generated_pitch: sanitizedBody,
            audit_notes: JSON.stringify({
              finding: parsed.audit_finding,
              impact: parsed.business_impact,
              service: parsed.recommended_service || 'Consultation',
              pitch: parsed.service_pitch
            }),
            pitch_text: sanitizedBody,
            audit_finding: parsed.audit_finding,
            business_impact: parsed.business_impact,
            recommended_service: parsed.recommended_service,
            service_pitch: parsed.service_pitch,
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
        model: 'deepseek-chat',
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
        if (parsed.error) {
          return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
        }
        if (parsed.audit_finding && parsed.email_body) {
          const sanitizedBody = sanitizeGreetingAndBody(parsed.email_body, extraParams?.founderName, companyName);
          return {
            email_subject,
            audit_summary: `Audit Pitch for ${companyName}`,
            generated_pitch: sanitizedBody,
            audit_notes: JSON.stringify({
              finding: parsed.audit_finding,
              impact: parsed.business_impact,
              service: parsed.recommended_service || 'Consultation',
              pitch: parsed.service_pitch
            }),
            pitch_text: sanitizedBody,
            audit_finding: parsed.audit_finding,
            business_impact: parsed.business_impact,
            recommended_service: parsed.recommended_service,
            service_pitch: parsed.service_pitch,
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
        const email_subject = parsed.email_subject || `Diagnostic for ${companyName}`;
        if (parsed.error) {
          return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
        }
        if (parsed.audit_finding && parsed.email_body) {
          const sanitizedBody = sanitizeGreetingAndBody(parsed.email_body, extraParams?.founderName, companyName);
          return {
            email_subject,
            audit_summary: `Audit Pitch for ${companyName}`,
            generated_pitch: sanitizedBody,
            audit_notes: JSON.stringify({
              finding: parsed.audit_finding,
              impact: parsed.business_impact,
              service: parsed.recommended_service || 'Consultation',
              pitch: parsed.service_pitch
            }),
            pitch_text: sanitizedBody,
            audit_finding: parsed.audit_finding,
            business_impact: parsed.business_impact,
            recommended_service: parsed.recommended_service,
            service_pitch: parsed.service_pitch,
          };
        }
      }
    } catch (err: any) {
      console.error('[AI Pitch] OpenRouter Error:', err?.message || err);
    }
  }

  // 6. Structured Static Fallback
  return {
    email_subject: '',
    audit_summary: '',
    generated_pitch: '',
    error: 'The automated audit could not generate a verified finding.'
  };
}

export async function generateFollowUpPitch(
  previousPitchText: string,
  followUpStep: number, // 1, 2, or 3
  companyName: string,
  nicheInput?: string,
  founderName?: string | null,
  customPrompt?: string,
  auditNotesJson?: string | null
): Promise<{ email_subject: string; generated_pitch: string }> {
  const nicheInfo = await getNicheContextAsync(nicheInput);
  
  const founderFirst = founderName ? founderName.split(' ')[0] : null;
  const greeting = founderFirst ? `Hi ${founderFirst},` : 'Hi,';

  let originalService = nicheInfo.solution;
  let originalFinding = "technical issues";
  let originalImpact = nicheInfo.pains;
  
  if (auditNotesJson) {
    try {
      const parsed = JSON.parse(auditNotesJson);
      if (parsed.service) originalService = parsed.service;
      if (parsed.finding) originalFinding = parsed.finding;
      if (parsed.impact) originalImpact = parsed.impact;
    } catch(e) {}
  }

  let stepGoal = '';
  let stepRules = '';

  if (customPrompt && customPrompt.trim().length > 0) {
    stepGoal = `Follow custom user-defined instructions: ${customPrompt}`;
    stepRules = `Apply custom rules: ${customPrompt}`;
  } else if (followUpStep === 1) {
    stepGoal = `Follow up on the ${originalService} pitch related to ${originalFinding}.`;
    stepRules = `Sentence 1 (Reminder): A brief, polite reminder about the ${originalFinding} finding. Do NOT just say "Following up."
Sentence 2 (The Cost): Explain what happens if they don't fix the issue (e.g., ${originalImpact}).
Sentence 3 (The Solution): Reiterate how Mr² Labs can handle the ${originalService} for them so their team doesn't have to.
Sentence 4 (The CTA): A low-friction ask for a 10-minute conversation.`;
  } else if (followUpStep === 2) {
    stepGoal = `Change the angle. Introduce a broader perspective around ${originalService}.`;
    stepRules = `Sentence 1 (New Angle): "One more thought: beyond the initial finding, we could address this as part of a broader technical cleanup rather than treating it as a separate project."
Sentence 2 (Alternative Perspective): "Rather than adding more work to your existing team, Mr² Labs can take this entirely off your plate."
Sentence 3 (The CTA): "If this is something you're considering, would you be open to a quick 10-minute chat?"`;
  } else {
    stepGoal = 'Close the loop, preserve the relationship, zero guilt-tripping. Do not ask for a meeting.';
    stepRules = `Sentence 1: "I'll close the loop here so I don't keep filling your inbox."
Sentence 2: "If ${originalService} or improving the website becomes a priority in the future, I'd be happy to reconnect."
Sentence 3: "I'll keep your details on file. Wishing you and the team continued success."`;
  }

  const systemPrompt = `You are an elite B2B Sales Development Rep for Mr² Labs. Your goal is to write Follow-Up #${followUpStep} to a ${nicheInfo.niche} business.
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
            generated_pitch: sanitizeGreetingAndBody(parsed.generated_email_body, founderName, companyName),
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
            generated_pitch: sanitizeGreetingAndBody(parsed.generated_email_body, founderName, companyName),
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
        model: 'mistral-small-2506',
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
            generated_pitch: sanitizeGreetingAndBody(parsed.generated_email_body, founderName, companyName),
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
        model: 'deepseek-chat',
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
            generated_pitch: sanitizeGreetingAndBody(parsed.generated_email_body, founderName, companyName),
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
        model: 'meta-llama/llama-3.3-70b-instruct:free',
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
            generated_pitch: sanitizeGreetingAndBody(parsed.generated_email_body, founderName, companyName),
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
    fallbackBody = `${greeting}\n\nJust following up on my previous message. One thing we've seen is that ${originalImpact} becomes increasingly expensive as a business grows.\n\nThat's exactly where we help by delivering ${originalService}.\n\nWould a quick 10-minute conversation this week be worth exploring?`;
  } else if (followUpStep === 2) {
    fallbackBody = `${greeting}\n\nOne more thought on this: you may already have the infrastructure in place, the challenge is often the operational friction behind it.\n\nRather than adding more manual work to your existing team, we can take this entirely off your plate with our ${originalService}.\n\nIf this is something you're considering, would you be open to a quick 10-minute chat?`;
  } else {
    fallbackBody = `${greeting}\n\nI'll close the loop here so I don't keep filling your inbox.\n\nIf ${originalService} becomes a priority in the future, I'd be happy to reconnect and explore what we could build around it.\n\nI'll keep your details on file. Wishing you and the team continued success.`;
  }

  return {
    email_subject: followUpStep === 3 ? 'Closing the loop' : 'Following up',
    generated_pitch: fallbackBody,
  };
}
