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
- Never lie about a problem. If you cannot verify the exact issue, use phrasing like 'Companies at your stage often run into...'
- Never explain your entire company or list your tech stack (React, Next.js, etc.). Sell the outcome.
- Formatting: You MUST use double line breaks (\n\n) to create distinct paragraphs. Separate the greeting, the main body, and the CTA. Do NOT write a single block of text.
- Typography: Use standard keyboard hyphens (-). Absolutely NO em dashes (—), en dashes (–), or non-breaking hyphens (‑).

EMAIL FORMULA:
Sentence 1 (Observation): Prove you looked at them. Use the scraped text or social links to make a real observation. (e.g., "I came across ${companyName} and noticed [specific detail about their site or online presence].")
Sentence 2 (The Problem): Frame the pain point generally. Do NOT say "You are losing leads." Say "${nicheInfo.niche} teams often lose opportunities when ${nicheInfo.pains}."
Sentence 3 (The Outcome): State what our system does. "At MR² Labs, we build custom systems that ${nicheInfo.solution}."
Sentence 4 (The CTA): Ultra low-friction ask. "Worth a quick 10-minute conversation this week?" or "Open to a quick 10-minute chat?"

Output valid JSON ONLY in this format. You MUST complete the "internal_diagnosis" block before writing the email:
{
  "internal_diagnosis": {
    "what_they_do": "Based on their website text, what exact services do they offer?",
    "observable_problem": "What technical or operational gap is likely missing based on what they do?",
    "likely_business_impact": "How does this gap hurt their revenue, capacity, or growth?"
  },
  "email_subject": "1 to 4 words",
  "generated_email_body": "The complete 4-sentence email string based strictly on your diagnosis."
}

CRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. You are returning raw text formatted as JSON only.`;

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

  // 6. Structured Static Fallback (4-Sentence SDR Formula)
  const greeting = founderFirst ? `Hi ${founderFirst},` : 'Hi,';
  const sentence1 = `I came across ${companyName} while reviewing ${nicheInfo.niche} companies in your market.`;
  const sentence2 = `${nicheInfo.niche} teams often run into bottlenecks when ${nicheInfo.pains}, especially as they grow.`;
  const sentence3 = `At MR² Labs, we build custom systems that ${nicheInfo.solution}.`;
  const sentence4 = `Would you be open to a quick 10-minute conversation this week?`;

  const fallbackBody = `${greeting}\n\n${sentence1} ${sentence2} ${sentence3}\n\n${sentence4}`;

  return {
    email_subject: `Question for ${companyName}`,
    audit_summary: `4-Sentence SDR Pitch for ${companyName}`,
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
