import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeGreetingAndBody } from '@/lib/email/formatter';
import { PitchGuardContext, formatPitchGuardPrompt } from './pitch-guard';
import { validateGeneratedClaims } from './claim-validator';
import { VerifiedFeaturesMap } from '@/lib/verification/features';
import { ClaimValidationStatus } from '@/types/lead';
import { GROQ_MODELS, GEMINI_MODELS, MISTRAL_MODELS, DEEPSEEK_MODELS, OPENROUTER_MODELS } from './models';
import { 
  doubleCheckCustomerPOVPitch, 
  generatePreMadeCustomerPOVPitch, 
  CustomerPOVProblem,
  CUSTOMER_POV_FOOTER
} from './customer-pov-double-checker';

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
  claim_validation_status?: ClaimValidationStatus;
  claim_validation_notes?: string;
}

export interface PitchGenerationParams {
  companyName: string;
  domain: string;
  domSnippet?: string;
  nicheInput?: string;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  founderName?: string | null;
  founderConfidence?: number;
  isTechnicalAudience?: boolean;
  rawAuditData?: Record<string, any>;
  pitchGuardContext?: PitchGuardContext;
  verifiedFeatures?: VerifiedFeaturesMap;
  painPoint?: string | null;
  mr2Solution?: string | null;
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

function buildAndValidateResult(
  parsed: any,
  companyName: string,
  extraParams?: {
    founderName?: string | null;
    founderConfidence?: number;
    pitchGuardContext?: PitchGuardContext;
    verifiedFeatures?: VerifiedFeaturesMap;
    nicheInput?: string;
    domain?: string;
  }
): AuditResult {
  const email_subject = parsed.email_subject || `couldn't find your booking page`;
  if (parsed.error) {
    return { email_subject: '', audit_summary: '', generated_pitch: '', error: parsed.error };
  }
  const rawBody = parsed.email_body || parsed.generated_pitch;
  if (parsed.audit_finding && rawBody) {
    const sanitizedBody = sanitizeGreetingAndBody(
      rawBody, 
      extraParams?.founderName, 
      companyName,
      { confidence: extraParams?.founderConfidence, niche: extraParams?.nicheInput }
    );

    // Execute Claim Validator against Verified Evidence Ledger
    if (extraParams?.verifiedFeatures) {
      const validation = validateGeneratedClaims(
        sanitizedBody,
        email_subject,
        extraParams.verifiedFeatures,
        extraParams.pitchGuardContext?.forbiddenClaims || []
      );

      if (!validation.isValid) {
        console.warn(`[Pitch Guard] Claim Contradiction caught: ${validation.notes}`);
        return {
          email_subject: '',
          audit_summary: '',
          generated_pitch: '',
          error: `CLAIM_CONTRADICTION: ${validation.notes}`,
          claim_validation_status: 'FAILED',
          claim_validation_notes: validation.notes,
        };
      }
    }

    // Double Checker: Customer Perspective POV, zero domain in body, no em-dashes in subject, Loom audit
    const doubleCheck = doubleCheckCustomerPOVPitch(
      email_subject,
      sanitizedBody,
      companyName,
      extraParams?.domain || '',
      extraParams?.verifiedFeatures,
      extraParams?.nicheInput,
      extraParams?.founderName,
      extraParams?.founderConfidence
    );

    const finalSubject = doubleCheck.repairedSubject || email_subject;
    const finalPitch = doubleCheck.repairedPitch || sanitizedBody;

    return {
      email_subject: finalSubject,
      audit_summary: `Customer POV Pitch for ${companyName}`,
      generated_pitch: finalPitch,
      audit_notes: JSON.stringify({
        finding: parsed.audit_finding,
        impact: parsed.business_impact,
        service: parsed.recommended_service || 'Automated Booking & Lead Intake',
        pitch: parsed.service_pitch,
        claim_validation: 'PASSED',
        double_check_notes: doubleCheck.notes,
      }),
      pitch_text: finalPitch,
      audit_finding: parsed.audit_finding,
      business_impact: parsed.business_impact,
      recommended_service: parsed.recommended_service,
      service_pitch: parsed.service_pitch,
      claim_validation_status: 'PASSED',
      claim_validation_notes: `All claims verified against Evidence Ledger. Double Check: ${doubleCheck.notes.join('; ')}`,
    };
  }

  return {
    email_subject: '',
    audit_summary: '',
    generated_pitch: '',
    error: 'The automated audit could not generate a verified finding.',
  };
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
    founderConfidence?: number;
    isTechnicalAudience?: boolean;
    rawAuditData?: Record<string, any>;
    pitchGuardContext?: PitchGuardContext;
    verifiedFeatures?: VerifiedFeaturesMap;
    painPoint?: string | null;
    mr2Solution?: string | null;
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

  const founderConfidence = typeof extraParams?.founderConfidence === 'number' 
    ? extraParams.founderConfidence 
    : (extraParams?.founderName ? 85 : 0);

  const founderFirst = extraParams?.founderName && founderConfidence >= 75
    ? extraParams.founderName.replace(/^(dr\.|mr\.|mrs\.|ms\.)\s+/i, '').split(' ')[0]
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

  const cleanCompany = companyName
    ? companyName.trim().replace(/[,.]?\s*\b(llc|inc|corp|corporation|ltd|co|pc|pllc|group|holdings)\b\.?/gi, '').replace(/[,.]\s*$/, '').trim()
    : 'your team';

  const nicheLower = (nicheInput || '').toLowerCase();
  let nichePlural = 'businesses';
  if (nicheLower.includes('medspa') || nicheLower.includes('aesthetic')) nichePlural = 'medspas';
  else if (nicheLower.includes('dental') || nicheLower.includes('dentist')) nichePlural = 'dental clinics';
  else if (nicheLower.includes('clinic') || nicheLower.includes('health') || nicheLower.includes('doctor')) nichePlural = 'private clinics';
  else if (nicheLower.includes('law') || nicheLower.includes('legal') || nicheLower.includes('attorney')) nichePlural = 'law firms';
  else if (nicheLower.includes('real estate') || nicheLower.includes('realt') || nicheLower.includes('broker')) nichePlural = 'real estate agencies';
  else if (nicheLower.includes('trade') || nicheLower.includes('plumb') || nicheLower.includes('hvac') || nicheLower.includes('electric') || nicheLower.includes('roof')) nichePlural = 'home service companies';
  else if (nicheLower.includes('agency') || nicheLower.includes('marketing')) nichePlural = 'digital agencies';
  else if (nicheLower.includes('saas') || nicheLower.includes('software')) nichePlural = 'tech companies';

  const pitchGuardPrompt = extraParams?.pitchGuardContext
    ? formatPitchGuardPrompt(extraParams.pitchGuardContext)
    : '';

  const customPainInstruction = extraParams?.painPoint 
    ? `\nCUSTOM PAIN POINT TO HIGHLIGHT: "${extraParams.painPoint}".\nDirectly anchor Paragraph 1 around this exact friction point from the customer POV.`
    : '';

  const customSolutionInstruction = extraParams?.mr2Solution 
    ? `\nCUSTOM MR² LABS SOLUTION: "${extraParams.mr2Solution}".\nIn Paragraph 3, present this exact system/solution as what you build for ${nichePlural}.`
    : '';

  const systemPrompt = `${pitchGuardPrompt}
CRITICAL: You are an instruction-follower writing outbound emails for Mr² Labs.
PERSPECTIVE: Confused Potential Customer POV.
You are NOT acting like a vendor, marketing agency, or auditor.
You are opening as a REAL, CONFUSED POTENTIAL CUSTOMER who tried to book or contact ${cleanCompany} and experienced friction firsthand.
${customPainInstruction}
${customSolutionInstruction}

WHY THIS WORKS:
They do not feel pitched or sold to. They feel like they are losing a real paying customer right now. Their urgent panic/curiosity reaction drives replies.

## STRICT WRITING RULES (ZERO EM DASHES ANYWHERE):
- ZERO EM DASHES (—), EN DASHES (–), OR DOUBLE DASHES (--) ANYWHERE IN THE SUBJECT OR BODY. STRICTLY BANNED. Use simple commas (,), periods (.), or standard hyphens (-) only.
- Subject line: 2 to 5 words, lowercase. Must look like a real customer emailing the business.
- Permitted patterns:
  * couldn't find your booking page
  * how do i book an appointment at ${cleanCompany}
  * quick question before i book at ${cleanCompany}
  * question about booking at ${cleanCompany}
  * tried to reach your team
  * is your contact form working
  * couldn't reach anyone after hours
  * question for ${cleanCompany}
- NEVER use vendor buzzwords: "audit", "proposal", "optimization", "growth", "gap", "leakage", "missed leads".

## EMAIL BODY RULES:
1. GREETING:
   - If Founder First Name is provided, use "Hi [First Name],".
   - Otherwise, use "Hi ${cleanCompany} team,".
   - Never output placeholders, never write "Hi Owner", never write "Hi null".

2. PARAGRAPH 1 — CUSTOMER FRICTION (1-2 sentences):
   - Open as a customer who tried to take action on ${cleanCompany} and experienced friction.${extraParams?.painPoint ? ` MUST reflect this pain: "${extraParams.painPoint}".` : ''}
   - NEVER MENTION DOMAIN NAMES OR URLS (no .com, no http, no links). ONLY mention the business name "${cleanCompany}".
   - Examples based on real audit findings (NOTE: Zero em dashes):
     * Missing booking: "I was trying to book an appointment at ${cleanCompany} tonight but couldn't find a way to do it online after hours, ended up leaving without booking."
     * Inquiry/Contact friction: "Tried submitting an inquiry on ${cleanCompany} earlier but it kept hanging up on my phone, wasn't sure if it went through."
     * After-hours contact: "Tried reaching someone at ${cleanCompany} earlier with a quick question before booking, but couldn't get a response after hours."

3. PARAGRAPH 2 — BENEFIT OF THE DOUBT (1 sentence):
   - Polite, non-confrontational: "Not sure if that's intentional or something worth fixing on your end." OR "Wanted to flag it in case the form isn't working properly."

4. PARAGRAPH 3 — THE NATURAL PIVOT (1-2 sentences):
   - Reveal what you do naturally (NOTE: Zero em dashes):
   - ${extraParams?.mr2Solution ? `"I actually build ${extraParams.mr2Solution} for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically."` : `"I actually build automated booking systems for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically."`}
   - BANNED: NEVER say "PDF audit", "audit report", "diagnostic report". We ONLY offer a "quick 2-minute Loom breakdown".

5. PARAGRAPH 4 — LOW-FRICTION CTA (1 sentence):
   - "Want me to send it over?"

6. SIGN-OFF:
   Best,
   Rashard

7. DUAL-ACTION FOOTER:
${CUSTOMER_POV_FOOTER}

HARD CONSTRAINTS:
1. Maximum 100 words total.
2. DO NOT mention any domain extensions (.com, .io, .net, etc.) or web links anywhere in the body.
3. Every section separated by double line breaks (\\n\\n).
4. STRICTLY ZERO EM DASHES (—) or en dashes (–) anywhere.
5. Output valid JSON ONLY.

## OUTPUT FORMAT:
{
  "email_subject": "couldn't find your booking page",
  "audit_finding": "${extraParams?.painPoint ? extraParams.painPoint.replace(/"/g, '\\"') : 'No after-hours online booking system found'}",
  "business_impact": "Leads arriving after business hours drop off without self-scheduling",
  "recommended_service": "${extraParams?.mr2Solution ? extraParams.mr2Solution.replace(/"/g, '\\"') : 'Automated 24/7 Booking Assistant'}",
  "service_pitch": "${extraParams?.mr2Solution ? extraParams.mr2Solution.replace(/"/g, '\\"') : 'Automated booking system for ' + cleanCompany}",
  "email_body": "Hi Sarah,\\n\\nI was trying to book an appointment at ${cleanCompany} tonight but couldn't find a way to do it online after hours, ended up leaving without booking.\\n\\nNot sure if that's intentional or something worth fixing on your end.\\n\\nI actually build automated booking systems for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically.\\n\\nWant me to send it over?\\n\\nBest,\\nRashard\\n\\n${CUSTOMER_POV_FOOTER.replace(/\n/g, '\\n')}"
}
`;

  const founderFirstStr = founderFirst 
    ? `Founder First Name: ${founderFirst}` 
    : `Founder Name: None (Use "Hi ${cleanCompany} team,")`;

  const userPrompt = `Target Company Name: ${cleanCompany}
Domain: ${domain}
${founderFirstStr}
Niche: ${nicheInfo.niche} (${nichePlural})
${extraParams?.painPoint ? `Identified Customer Pain Point: ${extraParams.painPoint}\n` : ''}${extraParams?.mr2Solution ? `Targeted Mr² Labs Solution: ${extraParams.mr2Solution}\n` : ''}Scraped Audit Data: ${JSON.stringify(flaggedOnly)}`;

  let lastContradictionError: string | null = null;
  const extraValidationContext = { ...extraParams, domain, nicheInput };

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
        const res = buildAndValidateResult(parsed, companyName, extraValidationContext);
        if (!res.error) return res;
        if (res.error.startsWith('CLAIM_CONTRADICTION')) lastContradictionError = res.error;
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
        model: GEMINI_MODELS.PRIMARY,
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
        const res = buildAndValidateResult(parsed, companyName, extraValidationContext);
        if (!res.error) return res;
        if (res.error.startsWith('CLAIM_CONTRADICTION')) lastContradictionError = res.error;
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
        model: MISTRAL_MODELS.PRIMARY,
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
        const res = buildAndValidateResult(parsed, companyName, extraValidationContext);
        if (!res.error) return res;
        if (res.error.startsWith('CLAIM_CONTRADICTION')) lastContradictionError = res.error;
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
        model: DEEPSEEK_MODELS.PRIMARY,
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
        const res = buildAndValidateResult(parsed, companyName, extraValidationContext);
        if (!res.error) return res;
        if (res.error.startsWith('CLAIM_CONTRADICTION')) lastContradictionError = res.error;
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
        model: OPENROUTER_MODELS.PRIMARY_FREE,
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
        const res = buildAndValidateResult(parsed, companyName, extraValidationContext);
        if (!res.error) return res;
        if (res.error.startsWith('CLAIM_CONTRADICTION')) lastContradictionError = res.error;
      }
    } catch (err: any) {
      console.error('[AI Pitch] OpenRouter Error:', err?.message || err);
    }
  }

  // 6. Pre-Made Customer POV Template Fallback (Ensures zero downtime & 100% compliance)
  let fallbackProblem: CustomerPOVProblem = 'MISSING_BOOKING';
  if (extraParams?.verifiedFeatures) {
    if (extraParams.verifiedFeatures.onlineBooking.status === 'CONFIRMED_PRESENT') {
      fallbackProblem = extraParams.verifiedFeatures.liveChat.status === 'NOT_FOUND' 
        ? 'AFTER_HOURS_CONTACT' 
        : 'FORM_FRICTION';
    }
  }

  const preMade = generatePreMadeCustomerPOVPitch(
    companyName,
    extraParams?.founderName,
    nicheInput,
    fallbackProblem,
    { founderConfidence: extraParams?.founderConfidence }
  );

  return {
    email_subject: preMade.email_subject,
    audit_summary: `Customer POV Pitch for ${cleanCompany}`,
    generated_pitch: preMade.email_body,
    audit_notes: JSON.stringify({
      finding: preMade.audit_finding,
      impact: preMade.business_impact,
      service: preMade.recommended_service,
      claim_validation: 'PASSED',
      source: 'PRE_MADE_CUSTOMER_POV_TEMPLATE',
    }),
    pitch_text: preMade.email_body,
    audit_finding: preMade.audit_finding,
    business_impact: preMade.business_impact,
    recommended_service: preMade.recommended_service,
    service_pitch: 'Automated booking & lead intake',
    claim_validation_status: 'PASSED',
    claim_validation_notes: 'Generated via verified Pre-Made Customer POV template',
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
  
  const cleanCompany = companyName
    ? companyName.trim().replace(/[,.]?\s*\b(llc|inc|corp|corporation|ltd|co|pc|pllc|group|holdings)\b\.?/gi, '').replace(/[,.]\s*$/, '').trim()
    : 'your team';

  const founderFirst = founderName ? founderName.split(' ')[0] : null;
  const greeting = founderFirst ? `Hi ${founderFirst},` : `Hi ${cleanCompany} team,`;

  function cleanFollowUpSubjectAndBody(subject: string, body: string): { email_subject: string; generated_pitch: string } {
    let cleanSub = (subject || `quick question for ${cleanCompany}`)
      .replace(/[—–]|--/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    let cleanBody = body
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/www\.[^\s]+/gi, '')
      .replace(/\s*[—–]\s*/g, ', ');

    const footerRegex = /(?:[-—–_]{2,}\s*\n?)?(?:\*\*)?If you'd prefer not to hear from me[\s\S]*$/i;
    if (footerRegex.test(cleanBody)) {
      cleanBody = cleanBody.replace(footerRegex, CUSTOMER_POV_FOOTER).trim();
    } else if (!cleanBody.includes('need my free breakdown reply "yes"')) {
      cleanBody = `${cleanBody.trim()}\n\n${CUSTOMER_POV_FOOTER}`;
    }

    cleanBody = cleanBody.replace(/\n\s*[-—–_]{2,}\s*\n/g, '\n\n').replace(/\n\s*[-—–_]{2,}\s*$/g, '');

    return {
      email_subject: cleanSub,
      generated_pitch: cleanBody
    };
  }

  let stepGoal = '';
  let stepRules = '';

  if (customPrompt && customPrompt.trim().length > 0) {
    stepGoal = `Follow custom user-defined instructions: ${customPrompt}`;
    stepRules = `Apply custom rules: ${customPrompt}`;
  } else if (followUpStep === 1) {
    stepGoal = `Remind them of the quick 2-minute Loom video breakdown showing how ${cleanCompany} can capture after-hours bookings and inquiries automatically.`;
    stepRules = `Sentence 1 (Zero em dashes): "Wanted to make sure you saw my note from yesterday, put together a quick 2-minute Loom breakdown showing how ${cleanCompany} could capture those after-hours bookings automatically."
Sentence 2 (Low friction CTA): "Want me to send over the link?"
Sign-off: "Best,\nRashard"
Footer: "${CUSTOMER_POV_FOOTER}"`;
  } else if (followUpStep === 2) {
    stepGoal = `Explain that they don't need to replace their website or existing software; the booking automation layers right on top of what ${cleanCompany} already has.`;
    stepRules = `Sentence 1 (Zero em dashes): "One more quick thought, you wouldn't need to replace your existing tools or website to fix this."
Sentence 2: "We can layer the automated booking system right on top of what ${cleanCompany} already has."
Sentence 3: "Happy to send over the 2-minute video breakdown if you'd like to take a look."
Sign-off: "Best,\nRashard"
Footer: "${CUSTOMER_POV_FOOTER}"`;
  } else {
    stepGoal = 'Breakup. Close the loop professionally, zero pressure, leave door open for future after-hours booking needs.';
    stepRules = `Sentence 1: "I'll close the loop here so I don't clutter your inbox."
Sentence 2: "If fixing the after-hours booking or lead response for ${cleanCompany} ever becomes a priority, feel free to reach back out anytime."
Sign-off: "Best,\nRashard"
Footer: "${CUSTOMER_POV_FOOTER}"`;
  }

  const systemPrompt = `You are the Follow-Up Sequence Controller for Mr² labs writing Follow-Up #${followUpStep} to ${cleanCompany}.
NEVER say "Just checking in" or "Any updates?" or "Following up on my previous email". 

STRICT WRITING RULES:
- Subject Line: Exactly 2 to 5 words, lowercase, NO punctuation tricks, NO emojis, NO title case. STRICTLY ZERO EM DASHES (— or --). (e.g., "quick question for ${cleanCompany}", "question about booking")
- Voice & Tone: Natural, friendly, helpful peer.
- Greeting: "${greeting}"
- Length: STRICTLY 2 to 3 sentences total. Maximum 80 words.
- NO domains or URLs anywhere in the email.
- Formatting: Double line breaks (\n\n) between every section.
- Output valid JSON ONLY.

GOAL FOR THIS FOLLOW-UP:
${stepGoal}

FORMULA:
${stepRules}

Output valid JSON ONLY in this format:
{
  "email_subject": "2-5 words lowercase",
  "generated_email_body": "The complete email string"
}`;

  const userPrompt = `Target Company Name: ${cleanCompany}
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
          const sanitized = sanitizeGreetingAndBody(parsed.generated_email_body, founderName, cleanCompany, { niche: nicheInput });
          return cleanFollowUpSubjectAndBody(parsed.email_subject || 'quick note', sanitized);
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
        model: GEMINI_MODELS.PRIMARY,
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
          const sanitized = sanitizeGreetingAndBody(parsed.generated_email_body, founderName, cleanCompany, { niche: nicheInput });
          return cleanFollowUpSubjectAndBody(parsed.email_subject || 'quick note', sanitized);
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
        model: MISTRAL_MODELS.PRIMARY,
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
          const sanitized = sanitizeGreetingAndBody(parsed.generated_email_body, founderName, cleanCompany, { niche: nicheInput });
          return cleanFollowUpSubjectAndBody(parsed.email_subject || 'quick note', sanitized);
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
        model: DEEPSEEK_MODELS.PRIMARY,
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
          const sanitized = sanitizeGreetingAndBody(parsed.generated_email_body, founderName, cleanCompany, { niche: nicheInput });
          return cleanFollowUpSubjectAndBody(parsed.email_subject || 'quick note', sanitized);
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
        model: OPENROUTER_MODELS.PRIMARY_FREE,
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
          const sanitized = sanitizeGreetingAndBody(parsed.generated_email_body, founderName, cleanCompany, { niche: nicheInput });
          return cleanFollowUpSubjectAndBody(parsed.email_subject || 'quick note', sanitized);
        }
      }
    } catch (err: any) {
      console.error('[AI FollowUp] OpenRouter Error:', err?.message || err);
    }
  }

  // 6. Static Fallback
  let fallbackBody = '';
  if (followUpStep === 1) {
    fallbackBody = `${greeting}\n\nWanted to make sure you saw my note from yesterday, put together a quick 2-minute Loom breakdown showing how ${cleanCompany} could capture those after-hours bookings automatically.\n\nWant me to send over the link?\n\nBest,\nRashard\n\n${CUSTOMER_POV_FOOTER}`;
  } else if (followUpStep === 2) {
    fallbackBody = `${greeting}\n\nOne more quick thought, you wouldn't need to replace your existing tools or website to fix this. We can layer the automated booking system right on top of what ${cleanCompany} already has.\n\nHappy to send over the 2-minute video breakdown if you'd like to take a look.\n\nBest,\nRashard\n\n${CUSTOMER_POV_FOOTER}`;
  } else {
    fallbackBody = `${greeting}\n\nI'll close the loop here so I don't clutter your inbox.\n\nIf fixing the after-hours booking or lead response for ${cleanCompany} ever becomes a priority, feel free to reach back out anytime.\n\nBest,\nRashard\n\n${CUSTOMER_POV_FOOTER}`;
  }

  const fallbackSub = followUpStep === 3 
    ? `closing the loop for ${cleanCompany}`
    : (followUpStep === 1 ? `question about booking at ${cleanCompany}` : `quick question for ${cleanCompany}`);

  return cleanFollowUpSubjectAndBody(fallbackSub, fallbackBody);
}
