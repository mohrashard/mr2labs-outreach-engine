import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { hasValidMxRecords } from '@/lib/email/validator';

export interface EnrichedContactData {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  dom_snippet: string;
  enrichment_source?: 'DOM' | 'SERPER_DORK' | 'SERPAPI_DORK' | 'APOLLO' | 'PROSPEO' | 'HUNTER' | 'SNOV' | 'NONE';
  is_rejected?: boolean;
}

export interface DisambiguatedFounder {
  first_name: string | null;
  last_name: string | null;
  confidence: 'HIGH' | 'NONE';
}

export function isValidLeadEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const lower = email.toLowerCase().trim();

  // Block generic catch-all, networking, and team inboxes
  const genericPrefixes = [
    'press@', 'info@', 'admin@', 'hello@', 'support@', 'sales@', 
    'webleads', 'askthe', 'myhome@', 'contact@', 'office@', 'help@',
    'inquiries@', 'team@', 'general@', 'jobs@', 'careers@', 'media@',
    'marketing@', 'billing@', 'privacy@', 'legal@', 'compliance@',
    'associationnetworking@', 'networking@', 'membership@', 'events@', 'newsletter@'
  ];
  if (genericPrefixes.some(prefix => lower.startsWith(prefix))) return false;

  const invalidDomains = [
    'sentry.io', 'wixpress.com', 'example.com', 'schema.org', 'domain.com', 
    'godaddy.com', 'compass.com', 'century21.com', 'remax.com', 'kw.com',
    'avisonyoung.com', 'usnews.com', 'realtrends.com', 'serhant.com', 'miamirealtors.com',
    'nar.realtor'
  ];
  const invalidExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.js', '.css', '.third', 
    '.org', '.gov', '.edu', 
    '.ru', '.cn', '.in', '.vn', '.br'
  ];
  
  if (invalidDomains.some(d => lower.includes(d))) return false;
  if (invalidExts.some(ext => lower.endsWith(ext))) return false;
  
  return true;
}

function extractCleanHostname(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return urlStr.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

/**
 * 1. Company Name Sanitizer Utility (Pre-Search)
 * Strips SEO keywords, pipe/hyphen separators, and common fluff words.
 */
export function sanitizeCompanyName(rawName: string, domainUrl: string): string {
  const rootDomain = extractCleanHostname(domainUrl);
  if (!rawName) {
    return domainToTitleCase(rootDomain);
  }

  // Split on common separators: |, –, —, •, :
  let clean = rawName.split(/[\|–—•:]/)[0];

  // Also handle " - " spacing hyphens
  if (clean.includes(' - ')) {
    clean = clean.split(' - ')[0];
  }

  // Strip fluff/noise phrases & years
  const noiseRegex = /\b(home|welcome to|best real estate agents|best|top|#1|official site|202[0-9]|203[0-9]|inc|llc|ltd|group|co|corp|realtors®?)\b/gi;
  clean = clean.replace(noiseRegex, '').replace(/\s+/g, ' ').trim();

  // If result is empty or directory-like, fallback to Title Case of domain
  if (!clean || clean.length < 2) {
    return domainToTitleCase(rootDomain);
  }

  return clean;
}

function domainToTitleCase(hostname: string): string {
  try {
    const cleanHost = hostname.replace(/^www\./, '').split('.')[0];
    return cleanHost.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Company';
  }
}

/**
 * Headless browser HTML fetcher for Client-Side Rendered (CSR / SPA) applications.
 */
async function fetchRenderedHtmlWithFallback(targetUrl: string): Promise<string | null> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  
  // 1. Primary Headless Service: Browserless.io
  if (browserlessKey) {
    try {
      const res = await fetch(`https://chrome.browserless.io/content?token=${browserlessKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          rejectResourceTypes: ['image', 'stylesheet', 'font'],
          gotoOptions: { waitUntil: 'networkidle2', timeout: 10000 },
        }),
      });
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      console.warn('[CSR Fallback] Browserless fetch failed:', err);
    }
  }

  // 2. Secondary Headless Service: Microlink API
  try {
    const microlinkRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&embed=html`);
    if (microlinkRes.ok) {
      const data = await microlinkRes.json();
      if (data.data?.html) {
        return data.data.html;
      }
    }
  } catch (err) {
    console.warn('[CSR Fallback] Microlink fallback failed:', err);
  }

  return null;
}

/**
 * 3. Groq LLM Disambiguation Filter ($0 Cost / Micro-latency)
 * Evaluates search snippets to verify actual Founder/CEO vs independent agent/author.
 */
async function disambiguateFounderWithGroq(
  organicResults: Array<{ title: string; snippet?: string }>,
  cleanName: string,
  rootDomain: string
): Promise<DisambiguatedFounder> {
  const systemPrompt = `You are an executive research assistant. Your job is to extract the exact First and Last name of the real Founder, CEO, Owner, or Principal Broker of the target company — the actual decision-maker, not a senior employee, broker, or division head who works there.
Target Company: "${cleanName}" (Domain: "${rootDomain}")

Rules:
1. Only accept titles that indicate ownership or top-level authority: Founder, Co-Founder, CEO, President, Owner, Principal Broker.
2. REJECT titles like "Managing Director," "Vice President," "Broker Associate," "Sales Director," or "Team Lead" unless the snippet explicitly also states they founded or own the company.
3. If confident, return valid JSON: { "first_name": "...", "last_name": "...", "confidence": "HIGH" }
4. If no true founder/CEO/owner is found in the snippets, return JSON: { "first_name": null, "last_name": null, "confidence": "NONE" }

CRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. You are returning raw text formatted as JSON only.`;

  const resultsText = organicResults
    .slice(0, 5)
    .map((r, i) => `Result #${i + 1}:\nTitle: ${r.title || ''}\nSnippet: ${r.snippet || 'N/A'}`)
    .join('\n\n');

  const userPrompt = `Search Snippets for "${cleanName}":\n${resultsText}`;

  // 1. Primary: Groq SDK
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
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
        if (parsed.confidence === 'HIGH' && parsed.first_name) {
          return {
            first_name: String(parsed.first_name).trim(),
            last_name: parsed.last_name ? String(parsed.last_name).trim() : null,
            confidence: 'HIGH'
          };
        }
      }
    } catch (err: any) {
      console.warn('[Groq Disambiguator Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (parsed.confidence === 'HIGH' && parsed.first_name) {
          return {
            first_name: String(parsed.first_name).trim(),
            last_name: parsed.last_name ? String(parsed.last_name).trim() : null,
            confidence: 'HIGH'
          };
        }
      }
    } catch (err: any) {
      console.warn('[Gemini Disambiguator Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (parsed.confidence === 'HIGH' && parsed.first_name) {
          return {
            first_name: String(parsed.first_name).trim(),
            last_name: parsed.last_name ? String(parsed.last_name).trim() : null,
            confidence: 'HIGH'
          };
        }
      }
    } catch (err: any) {
      console.warn('[Mistral Disambiguator Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (parsed.confidence === 'HIGH' && parsed.first_name) {
          return {
            first_name: String(parsed.first_name).trim(),
            last_name: parsed.last_name ? String(parsed.last_name).trim() : null,
            confidence: 'HIGH'
          };
        }
      }
    } catch (err: any) {
      console.warn('[DeepSeek Disambiguator Warning]:', err?.message || err);
    }
  }

  // 5. Tier 5 Fallback: OpenRouter (Last Resort)
  const openrouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      const openrouter = new OpenAI({
        apiKey: openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'MR2 Outreach Engine',
        },
      });

      const response = await openrouter.chat.completions.create({
        model: 'auto:free',
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
        if (parsed.confidence === 'HIGH' && parsed.first_name) {
          return {
            first_name: String(parsed.first_name).trim(),
            last_name: parsed.last_name ? String(parsed.last_name).trim() : null,
            confidence: 'HIGH'
          };
        }
      }
    } catch (err: any) {
      console.warn('[OpenRouter Disambiguator Warning]:', err?.message || err);
    }
  }

  return { first_name: null, last_name: null, confidence: 'NONE' };
}

/**
 * Tier 2 Waterfall: Smart Serper.dev / SerpApi LinkedIn Founder Dorking with Groq LLM Disambiguation
 */
async function fetchEmailViaDorking(
  companyName: string, 
  domainUrl: string,
  targetPersonas?: string[]
): Promise<{ email: string; source: 'SERPER_DORK' | 'SERPAPI_DORK' } | null> {
  const rootDomain = extractCleanHostname(domainUrl);
  const cleanName = sanitizeCompanyName(companyName, domainUrl);
  
  const personas = (targetPersonas && targetPersonas.length > 0)
    ? targetPersonas
    : ["Founder", "Co-Founder", "CEO", "Owner", "Principal Broker"];
  const personaQuery = personas.map(p => `"${p}"`).join(' OR ');

  // High-Precision Dork Syntax
  const query = `site:linkedin.com/in/ (${personaQuery}) "${cleanName}" "${rootDomain}"`;

  let organicResults: any[] = [];
  let dorkSource: 'SERPER_DORK' | 'SERPAPI_DORK' = 'SERPER_DORK';

  // 1. Try Serper API key first
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query, num: 5 })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.organic) && data.organic.length > 0) {
          organicResults = data.organic;
        }
      } else {
        console.warn(`[Serper Dork] Request returned HTTP ${res.status}. Cascading to SerpApi fallback...`);
      }
    } catch (err) {
      console.warn('[Serper Dork Error]:', err);
    }
  }

  // 2. Fallback to SerpApi if Serper fails or has 0 results
  if (organicResults.length === 0) {
    const serpKey = process.env.SERP_API || process.env.SERP_API_FALLBACK || process.env.SERPAPI_API_KEY;
    if (serpKey) {
      try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpKey}&engine=google`;
        const res = await fetch(serpUrl);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.organic_results) && data.organic_results.length > 0) {
            organicResults = data.organic_results;
            dorkSource = 'SERPAPI_DORK';
          }
        }
      } catch (err) {
        console.warn('[SerpApi Dork Fallback Error]:', err);
      }
    }
  }

  if (organicResults.length === 0) return null;

  // 3. Groq AI Disambiguation Filter
  const disambiguation = await disambiguateFounderWithGroq(organicResults, cleanName, rootDomain);

  if (disambiguation.confidence !== 'HIGH' || !disambiguation.first_name) {
    console.log(`[Tier 2 Dork Disambiguator] Rejected snippets for "${cleanName}" (Confidence: ${disambiguation.confidence}). Cascading to Tier 3.`);
    return null;
  }

  // 4. Generate email candidates from verified founder name
  const first = disambiguation.first_name.toLowerCase().replace(/[^a-z]/g, '');
  const last = disambiguation.last_name ? disambiguation.last_name.toLowerCase().replace(/[^a-z]/g, '') : '';

  if (!first) return null;

  const candidates: string[] = [];
  if (last) {
    candidates.push(`${first}.${last}@${rootDomain}`);
    candidates.push(`${first}${last}@${rootDomain}`);
    candidates.push(`${first[0]}${last}@${rootDomain}`);
  }
  candidates.push(`${first}@${rootDomain}`);

  // 5. Verify MX records
  for (const candidate of candidates) {
    if (isValidLeadEmail(candidate)) {
      const hasMx = await hasValidMxRecords(candidate);
      if (hasMx) {
        console.log(`[${dorkSource} Verified Success] Found founder email for ${cleanName} (${first} ${last}): ${candidate}`);
        return { email: candidate, source: dorkSource };
      }
    }
  }

  return null;
}

/**
 * Tier 3 Waterfall: Apollo API Search (Generous Free Tier)
 */
async function fetchEmailFromApollo(domain: string): Promise<string | null> {
  const apiKey = process.env.APOLLO_KEY || process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        api_key: apiKey,
        q_organization_domains: domain,
        person_titles: ['CEO', 'Founder'],
        page: 1,
        per_page: 5,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const people = data.people;
    if (Array.isArray(people)) {
      for (const p of people) {
        if (p.email && isValidLeadEmail(p.email)) {
          console.log(`[Waterfall Apollo Success] Found decision-maker email for ${domain}: ${p.email}`);
          return p.email.toLowerCase();
        }
      }
    }
  } catch (err) {
    console.warn('[Waterfall Apollo] Apollo.io API error:', err);
  }
  return null;
}

/**
 * Tier 4 Waterfall: Prospeo API (50/day Free Tier)
 */
async function fetchEmailFromProspeo(domain: string, companyName?: string): Promise<string | null> {
  const apiKey = process.env.PROSPEO_API || process.env.PROSPEO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.prospeo.io/domain-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': apiKey
      },
      body: JSON.stringify({ domain })
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.error) return null;

    const emailList = data.response?.email_list || data.response?.emails || data.email_list || [];
    if (Array.isArray(emailList) && emailList.length > 0) {
      for (const item of emailList) {
        const candidate = typeof item === 'string' ? item : item.email;
        if (candidate && isValidLeadEmail(candidate)) {
          console.log(`[Waterfall Prospeo Success] Found email for ${domain}: ${candidate}`);
          return candidate.toLowerCase();
        }
      }
    }

    const singleEmail = data.response?.email || data.email;
    if (singleEmail && isValidLeadEmail(singleEmail)) {
      console.log(`[Waterfall Prospeo Success] Found email for ${domain}: ${singleEmail}`);
      return singleEmail.toLowerCase();
    }
  } catch (err) {
    console.warn('[Waterfall Prospeo] Prospeo API error:', err);
  }
  return null;
}

/**
 * Tier 5 Waterfall: Hunter.io Domain Search (Strict Reserve)
 */
async function fetchEmailFromHunter(domain: string): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;
  
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    const emails = data.data?.emails;
    if (Array.isArray(emails) && emails.length > 0) {
      const valid = emails.find((e: any) => isValidLeadEmail(e.value));
      if (valid) {
        console.log(`[Waterfall Hunter Success] Found email for ${domain}: ${valid.value}`);
        return valid.value.toLowerCase();
      }
    }
  } catch (err) {
    console.warn('[Waterfall Hunter] Hunter.io API error:', err);
  }
  return null;
}

/**
 * Tier 5 Waterfall Alternative: Snov.io API (Strict Reserve)
 */
async function fetchEmailFromSnov(domain: string): Promise<string | null> {
  const snovKey = process.env.SNOV_API || process.env.SNOV_SECRET;
  if (!snovKey) return null;

  try {
    const res = await fetch(`https://api.snov.io/v1/get-domain-emails-with-info?domain=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${snovKey}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.emails && Array.isArray(data.emails)) {
      const valid = data.emails.find((e: any) => isValidLeadEmail(e.email));
      if (valid) {
        console.log(`[Waterfall Snov Success] Found email for ${domain}: ${valid.email}`);
        return valid.email.toLowerCase();
      }
    }
  } catch (err) {
    console.warn('[Waterfall Snov] Snov.io API error:', err);
  }
  return null;
}

/**
 * MR² Labs Custom Software & Automation Lead Qualifier (Dynamic Bouncer)
 * Evaluates scraped text dynamically against active targetNiche before triggering costly Tier 2-5 enrichment APIs.
 */
export async function qualifyTargetCompany(
  domSnippet: string, 
  url: string,
  targetNiche?: string
): Promise<boolean> {
  if (!domSnippet || domSnippet.trim().length < 50) {
    return true; // Allow proceeding to CSR headless rendering if snippet is empty/tiny
  }

  const activeNiche = targetNiche || "General B2B";

  // Tech-Stack & Operational Friction Detection (Regex)
  const lowerSnippet = domSnippet.toLowerCase();
  const frictionIndicators = ['calendly.com', 'typeform.com', 'jotform.com', 'zapier', 'wix.com', 'squarespace.com', 'wordpress', 'hubspot'];
  const matchedTools = frictionIndicators.filter(tool => lowerSnippet.includes(tool));
  if (matchedTools.length > 0) {
    console.log(`[Operational Friction Detected for ${url}]: Relies on generic 3rd party tools (${matchedTools.join(', ')})`);
  }

  const systemPrompt = `You are a B2B Lead Qualifier for MR² Labs, a Full-Stack Software Engineering & Automation Studio. 
Our current outbound campaign is targeting: "${activeNiche}".

Read the provided website text and determine if this business fits the target niche.
- ACCEPT: Actual, operational companies that fit the "${activeNiche}" profile.
- REJECT: Global franchises, massive conglomerates, news/media publishers, job boards, aggregators/directories (e.g., Zillow, Clutch, Yelp), or empty parked domains.

Return JSON ONLY: { "is_qualified": boolean, "reason": "Brief explanation of why it fits or fails" }

CRITICAL INSTRUCTION: Do NOT generate or attempt to invoke any tool calls or function calls. You are returning raw text formatted as JSON only.`;

  const userPrompt = `Target URL: ${url}\nTarget Niche: ${activeNiche}\nWebsite Text Snippet:\n${domSnippet.slice(0, 3000)}`;

  // 1. Groq SDK Primary
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
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
        if (typeof parsed.is_qualified === 'boolean') {
          if (!parsed.is_qualified) {
            console.log(`[Bouncer Rejection] ${url}: ${parsed.reason || 'Unqualified target'}`);
            return false;
          }
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Bouncer Groq Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (typeof parsed.is_qualified === 'boolean') {
          if (!parsed.is_qualified) {
            console.log(`[Bouncer Rejection] ${url}: ${parsed.reason || 'Unqualified target'}`);
            return false;
          }
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Bouncer Gemini Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (typeof parsed.is_qualified === 'boolean') {
          if (!parsed.is_qualified) {
            console.log(`[Bouncer Rejection] ${url}: ${parsed.reason || 'Unqualified target'}`);
            return false;
          }
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Bouncer Mistral Warning]:', err?.message || err);
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());
        if (typeof parsed.is_qualified === 'boolean') {
          if (!parsed.is_qualified) {
            console.log(`[Bouncer Rejection] ${url}: ${parsed.reason || 'Unqualified target'}`);
            return false;
          }
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Bouncer DeepSeek Warning]:', err?.message || err);
    }
  }

  // 5. Tier 5 Fallback: OpenRouter (Last Resort)
  const openrouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      const openrouter = new OpenAI({
        apiKey: openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'MR2 Outreach Engine',
        },
      });

      const response = await openrouter.chat.completions.create({
        model: 'auto:free',
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
        if (typeof parsed.is_qualified === 'boolean') {
          if (!parsed.is_qualified) {
            console.log(`[Bouncer Rejection] ${url}: ${parsed.reason || 'Unqualified target'}`);
            return false;
          }
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Bouncer OpenRouter Warning]:', err?.message || err);
    }
  }

  // If AI checks fail, default to qualified to avoid dropping valid leads unexpectedly
  return true;
}

/**
 * Deep Enrichment Waterfall Pipeline
 * Cascades: Tier 1 (DOM Regex) -> Dynamic Bouncer Gate -> Tier 2 (Smart Serper/SerpApi Dorking + Groq LLM Disambiguation) -> Tier 3 (Apollo API) -> Tier 4 (Prospeo API) -> Tier 5 (Hunter/Snov)
 */
export async function deepEnrichDomain(
  domainUrl: string,
  companyName?: string,
  targetNiche?: string,
  targetPersonas?: string[]
): Promise<EnrichedContactData> {
  // SSRF Protection: Validate target domain format and reject internal IPs / metadata endpoints
  try {
    const parsed = new URL(domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`);
    const host = parsed.hostname.toLowerCase();
    
    // Block loopback, private RFC1918 IPs, link-local, and AWS metadata endpoints
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      console.warn(`[SSRF Prevention] Rejected internal or private domain target: ${domainUrl}`);
      return {
        email: null,
        phone: null,
        whatsapp: null,
        instagram_url: null,
        linkedin_url: null,
        dom_snippet: '',
        enrichment_source: 'NONE',
        is_rejected: true
      };
    }
  } catch {
    console.warn(`[SSRF Prevention] Invalid URL structure provided: ${domainUrl}`);
    return {
      email: null,
      phone: null,
      whatsapp: null,
      instagram_url: null,
      linkedin_url: null,
      dom_snippet: '',
      enrichment_source: 'NONE',
      is_rejected: true
    };
  }

  const targetUrls = [
    domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`,
    `${domainUrl.replace(/\/$/, '')}/contact`,
    `${domainUrl.replace(/\/$/, '')}/about`
  ];

  let email: string | null = null;
  let phone: string | null = null;
  let whatsapp: string | null = null;
  let instagram_url: string | null = null;
  let linkedin_url: string | null = null;
  let textSnippets: string[] = [];
  let enrichment_source: 'DOM' | 'SERPER_DORK' | 'SERPAPI_DORK' | 'APOLLO' | 'PROSPEO' | 'HUNTER' | 'SNOV' | 'NONE' = 'NONE';

  // Tier 1: Fast DOM Regex Scraping (Cost: $0)
  for (const url of targetUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $('script, style, nav, footer, svg').remove();
      const pageText = $('body').text().replace(/\s+/g, ' ').slice(0, 1500);
      if (pageText) textSnippets.push(pageText);

      const pageHtml = html.toLowerCase();

      // Tier 1 Email Extraction
      if (!email) {
        const emailMatches = pageHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const valid = emailMatches.find(e => isValidLeadEmail(e));
        if (valid) {
          email = valid.toLowerCase();
          enrichment_source = 'DOM';
        }
      }

      // Social Links & Phone
      if (!linkedin_url) {
        const link = $('a[href*="linkedin.com/"]').attr('href');
        if (link) linkedin_url = link;
      }
      if (!instagram_url) {
        const link = $('a[href*="instagram.com/"]').attr('href');
        if (link) instagram_url = link;
      }
      if (!whatsapp) {
        const link = $('a[href*="wa.me/"], a[href*="api.whatsapp.com/send"]').attr('href');
        if (link) whatsapp = link;
      }
      if (!phone) {
        const tel = $('a[href^="tel:"]').attr('href');
        if (tel) phone = tel.replace('tel:', '').trim();
      }

    } catch (err) {
      // Ignore sub-page timeout
    }
  }

  let dom_snippet = textSnippets.join(' ').slice(0, 2000);

  // Tier 1.5: CSR Headless Fallback if DOM snippet is tiny (< 150 chars)
  if (dom_snippet.length < 150) {
    try {
      const renderedHtml = await fetchRenderedHtmlWithFallback(domainUrl);
      if (renderedHtml) {
        const $ = cheerio.load(renderedHtml);
        $('script, style, nav, footer, svg').remove();
        const renderedText = $('body').text().replace(/\s+/g, ' ').slice(0, 1500);
        if (renderedText.length > dom_snippet.length) {
          dom_snippet = renderedText;
        }

        if (!email) {
          const emailMatches = renderedHtml.toLowerCase().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          const valid = emailMatches.find(e => isValidLeadEmail(e));
          if (valid) {
            email = valid.toLowerCase();
            enrichment_source = 'DOM';
          }
        }
      }
    } catch (err) {
      console.warn('[CSR Fallback Exception]:', err);
    }
  }

  // The Company Qualification Gate (Dynamic MR² Labs Bouncer)
  const isQualified = await qualifyTargetCompany(dom_snippet, domainUrl, targetNiche);
  if (!isQualified) {
    console.log(`[Rejected Lead] ${domainUrl} did not meet target criteria for niche "${targetNiche || 'General B2B'}".`);
    return {
      email: null,
      phone: null,
      whatsapp: null,
      instagram_url: null,
      linkedin_url: null,
      dom_snippet,
      enrichment_source: 'NONE',
      is_rejected: true
    };
  }

  // Waterfall Cascade if Tier 1 yielded no email
  if (!email) {
    const rootDomain = extractCleanHostname(domainUrl);

    // Tier 2: Smart API Dorking for Founder with Groq Disambiguation (Serper API -> SerpApi fallback)
    const effectiveCompanyName = companyName || domainToTitleCase(rootDomain);

    const dorkResult = await fetchEmailViaDorking(effectiveCompanyName, domainUrl, targetPersonas);
    if (dorkResult) {
      email = dorkResult.email;
      enrichment_source = dorkResult.source;
    }

    // Tier 3: Apollo API (Generous Free Tier)
    if (!email) {
      email = await fetchEmailFromApollo(rootDomain);
      if (email) {
        enrichment_source = 'APOLLO';
      }
    }

    // Tier 4: Prospeo API (50/day Free Tier)
    if (!email) {
      email = await fetchEmailFromProspeo(rootDomain, companyName);
      if (email) {
        enrichment_source = 'PROSPEO';
      }
    }

    // Tier 5: Hunter / Snov (Strict Reserves)
    if (!email) {
      email = await fetchEmailFromHunter(rootDomain);
      if (email) {
        enrichment_source = 'HUNTER';
      }
    }

    if (!email) {
      email = await fetchEmailFromSnov(rootDomain);
      if (email) {
        enrichment_source = 'SNOV';
      }
    }
  }

  return {
    email,
    phone,
    whatsapp,
    instagram_url,
    linkedin_url,
    dom_snippet,
    enrichment_source
  };
}

export async function enrichLeadEmail(
  domainUrl: string,
  domHtmlText?: string,
  targetNiche?: string,
  targetPersonas?: string[]
): Promise<string | null> {
  const data = await deepEnrichDomain(domainUrl, undefined, targetNiche, targetPersonas);
  return data.email;
}
