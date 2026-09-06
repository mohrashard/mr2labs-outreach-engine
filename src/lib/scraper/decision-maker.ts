// ==============================================================================
// MR² LABS OUTREACH ENGINE — ZERO-CREDIT DECISION MAKER ENGINE (v1.0.0)
// On-Site First Architecture: Schema.org -> Bio Pages -> Legal Pages -> NPI Gov -> SERP Fallback
// ==============================================================================

import * as cheerio from 'cheerio';
import { extractFounderWithGroq } from './groq-extractor';
import { lookupNpiRegistry } from './npi-registry';
import { FounderSource } from '@/types/lead';

export interface DecisionMakerResult {
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  confidence: number;
  source: FounderSource;
  evidenceText?: string | null;
}

/**
 * Splits a full name into first and last name components, removing honorifics.
 */
export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  
  // Clean honorifics from first name comparison (Dr., Mr., Mrs., etc.)
  const cleaned = fullName
    .replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms)\s+/i, '')
    .replace(/,\s*(md|dds|dmd|do|rn|np|pa|phd|llc|inc).*$/i, '')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Layer 1: Inspects Schema.org / JSON-LD for explicit founder or leadership markup.
 * Cost: $0.00 | Latency: <20ms
 */
export function extractDMFromSchema(html: string): DecisionMakerResult | null {
  if (!html) return null;

  try {
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]').toArray();

    for (const el of scripts) {
      try {
        const raw = $(el).html();
        if (!raw) continue;
        const data = JSON.parse(raw);
        const items = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;

          // 1. Explicit founder property
          if (item.founder) {
            const founderName = typeof item.founder === 'string' 
              ? item.founder 
              : (item.founder.name || null);

            if (founderName && typeof founderName === 'string' && founderName.trim().length > 2) {
              const { firstName, lastName } = splitPersonName(founderName);
              return {
                name: founderName.trim(),
                firstName: firstName || null,
                lastName: lastName || null,
                role: 'FOUNDER',
                confidence: 98,
                source: 'SCHEMA_JSON_LD',
                evidenceText: `Schema.org founder markup: "${founderName.trim()}"`,
              };
            }
          }

          // Universal leadership regex matching SaaS, Trades, Corporate, Legal, and Medical leaders
          const leadershipRegex = /founder|owner|ceo|c[a-z]o|president|principal|partner|director|chief|head|lead|master/i;

          // 2. Person with leadership jobTitle
          if (item['@type'] === 'Person') {
            const jobTitle = item.jobTitle || item.roleName || '';
            const name = item.name;
            if (name && typeof name === 'string' && leadershipRegex.test(jobTitle)) {
              const { firstName, lastName } = splitPersonName(name);
              return {
                name: name.trim(),
                firstName: firstName || null,
                lastName: lastName || null,
                role: jobTitle.trim().toUpperCase() || 'OWNER',
                confidence: 95,
                source: 'SCHEMA_JSON_LD',
                evidenceText: `Schema.org Person with title: "${name.trim()}" (${jobTitle})`,
              };
            }
          }

          // 3. Organization, MedicalBusiness, LegalService, Trades or LocalBusiness employee / member
          if (['MedicalBusiness', 'Physician', 'Dentist', 'LocalBusiness', 'Organization', 'LegalService', 'ProfessionalService', 'HomeAndConstructionBusiness'].includes(item['@type'])) {
            const candidates = [item.employee, item.member, item.alumni].flat().filter(Boolean);
            for (const cand of candidates) {
              if (cand && typeof cand === 'object' && cand.name) {
                const title = cand.jobTitle || cand.roleName || '';
                if (leadershipRegex.test(title)) {
                  const { firstName, lastName } = splitPersonName(cand.name);
                  return {
                    name: cand.name.trim(),
                    firstName: firstName || null,
                    lastName: lastName || null,
                    role: title.trim().toUpperCase() || 'LEADERSHIP',
                    confidence: 92,
                    source: 'SCHEMA_JSON_LD',
                    evidenceText: `Schema.org leadership member: "${cand.name.trim()}" (${title})`,
                  };
                }
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch (err: any) {
    console.warn('[Schema DM Extractor Warning]:', err?.message || err);
  }

  return null;
}

/**
 * Normalizes and resolves candidate internal subpage URLs.
 */
function resolveSubpageUrl(origin: string, href: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('tel:') || trimmed.startsWith('mailto:')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, origin);
    // Ensure it stays on the same root domain
    if (parsed.origin !== origin) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Layer 2: Scans on-site bio, team, and leadership pages and extracts decision maker with Groq.
 * Cost: $0.00 | Latency: ~600ms – 1.2s
 */
async function crawlBioPageAndExtract(
  origin: string,
  $: cheerio.CheerioAPI,
  companyName: string,
  industry: string = 'business'
): Promise<DecisionMakerResult | null> {
  const candidateUrls: string[] = [];

  // Look for high-probability bio navigation paths (Works for startups, law firms, contractors, and clinics)
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();

    const matchesBioPath = /about|story|team|people|staff|leadership|management|board|founder|owner|bio|profile|who-we-are|crew|professionals|attorneys|lawyers|agents|brokers/i.test(href);
    const matchesBioText = /about\s*us|our\s*team|meet\s*the\s*team|our\s*story|leadership|founder|attorneys|lawyers|agents|brokers/i.test(text);

    if (matchesBioPath || matchesBioText) {
      const resolved = resolveSubpageUrl(origin, href);
      if (resolved && !candidateUrls.includes(resolved)) {
        candidateUrls.push(resolved);
      }
    }
  });

  if (candidateUrls.length === 0) return null;

  // Prioritize team/leadership pages first, then about pages
  candidateUrls.sort((a, b) => {
    const aScore = /team|people|staff|leadership|attorney|lawyer|doctor|founder/i.test(a) ? 2 : 1;
    const bScore = /team|people|staff|leadership|attorney|lawyer|doctor|founder/i.test(b) ? 2 : 1;
    return bScore - aScore;
  });

  // Crawl only the top candidate subpage to protect Vercel execution limits
  const targetSubpage = candidateUrls[0];

  try {
    const subRes = await fetch(targetSubpage, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MR2Labs/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(3500), // Strict 3.5s timeout
    });

    if (!subRes.ok) return null;

    const subHtml = await subRes.text();
    const sub$ = cheerio.load(subHtml);

    // 1. Check if the subpage itself has JSON-LD
    const subpageSchema = extractDMFromSchema(subHtml);
    if (subpageSchema) return subpageSchema;

    // 2. Clean DOM and extract text for Groq analysis
    sub$('script, style, noscript, svg, nav, footer, header').remove();
    const cleanText = sub$('body').text().replace(/\s+/g, ' ').trim();

    if (cleanText.length < 50) return null;

    const aiResult = await extractFounderWithGroq(cleanText, companyName, industry);
    if (aiResult?.found && aiResult.name) {
      const { firstName, lastName } = splitPersonName(aiResult.name);
      return {
        name: aiResult.name,
        firstName: firstName || null,
        lastName: lastName || null,
        role: aiResult.role || 'LEADERSHIP',
        confidence: aiResult.confidence || 85,
        source: 'ABOUT_PAGE',
        evidenceText: aiResult.evidenceText || `Identified from team page: ${targetSubpage}`,
      };
    }
  } catch (err: any) {
    console.warn('[Bio Page Crawl Warning]:', err?.message || err);
  }

  return null;
}

/**
 * Layer 3: Inspects Legal, Privacy, and Terms pages for business operator names.
 * Cost: $0.00 | Latency: ~500ms
 */
async function crawlLegalPageAndExtract(
  origin: string,
  $: cheerio.CheerioAPI,
  companyName: string
): Promise<DecisionMakerResult | null> {
  const candidateUrls: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/privacy|terms|imprint|legal/i.test(href)) {
      const resolved = resolveSubpageUrl(origin, href);
      if (resolved && !candidateUrls.includes(resolved)) {
        candidateUrls.push(resolved);
      }
    }
  });

  if (candidateUrls.length === 0) return null;

  const targetLegalUrl = candidateUrls[0];

  try {
    const legalRes = await fetch(targetLegalUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MR2Labs/1.0' },
      signal: AbortSignal.timeout(3000),
    });

    if (!legalRes.ok) return null;

    const legalHtml = await legalRes.text();
    const legal$ = cheerio.load(legalHtml);
    legal$('script, style, noscript, svg, nav, footer, header').remove();
    const cleanText = legal$('body').text().replace(/\s+/g, ' ').trim();

    // Regex check for legal operator patterns
    const operatorMatch = cleanText.match(/(?:operated by|d\/b\/a|registered agent(?: is)?|owned and operated by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i);
    if (operatorMatch && operatorMatch[1]) {
      const candidateName = operatorMatch[1].trim();
      // Filter out corporate suffixes mistaken as personal names
      if (!/\b(inc|llc|corp|company|spa|clinic|center|group|realty)\b/i.test(candidateName)) {
        const { firstName, lastName } = splitPersonName(candidateName);
        return {
          name: candidateName,
          firstName: firstName || null,
          lastName: lastName || null,
          role: 'OWNER',
          confidence: 80,
          source: 'LEGAL_PAGE',
          evidenceText: `Extracted legal operator from ${targetLegalUrl}: "${candidateName}"`,
        };
      }
    }
  } catch (err: any) {
    console.warn('[Legal Page Crawl Warning]:', err?.message || err);
  }

  return null;
}

/**
 * Master On-Site First Decision Maker Orchestrator.
 * 
 * Cascade Execution Order:
 * 1. Layer 1: Schema.org / JSON-LD ($0, <50ms)
 * 2. Layer 2: On-site Bio/Team/Provider subpage + Groq ($0, ~800ms)
 * 3. Layer 3: Legal / Compliance Pages ($0, ~500ms)
 * 4. Layer 4: CMS NPPES NPI Registry ($0, public government API)
 * 5. Fallback: NOT_FOUND (triggers 100% Safe Handling)
 */
export async function findDecisionMakerFree(
  baseUrl: string,
  companyName: string,
  state: string | null = null,
  city: string | null = null,
  industry: string = 'business',
  existingHtml: string | null = null
): Promise<DecisionMakerResult> {
  try {
    const origin = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`).origin;

    let html = existingHtml;
    let $ = html ? cheerio.load(html) : null;

    // Fetch homepage HTML if not passed
    if (!html) {
      const res = await fetch(origin, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MR2Labs/1.0',
        },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        html = await res.text();
        $ = cheerio.load(html);
      }
    }

    if (html && $) {
      // ----------------------------------------------------------------------
      // LAYER 1: Schema.org / JSON-LD Goldmine ($0 Cost, <50ms)
      // ----------------------------------------------------------------------
      const schemaDM = extractDMFromSchema(html);
      if (schemaDM && schemaDM.confidence >= 80) {
        console.log(`[DM Engine] Layer 1 Success (Schema.org): Found ${schemaDM.name} (${schemaDM.role}) for ${baseUrl}`);
        return schemaDM;
      }

      // ----------------------------------------------------------------------
      // LAYER 2: Targeted Bio / Team Subpage Crawl + Groq ($0 Cost)
      // ----------------------------------------------------------------------
      const bioDM = await crawlBioPageAndExtract(origin, $, companyName, industry);
      if (bioDM && bioDM.confidence >= 80) {
        console.log(`[DM Engine] Layer 2 Success (Bio Page): Found ${bioDM.name} (${bioDM.role}) for ${baseUrl}`);
        return bioDM;
      }

      // ----------------------------------------------------------------------
      // LAYER 3: Legal & Policy Pages ($0 Cost)
      // ----------------------------------------------------------------------
      const legalDM = await crawlLegalPageAndExtract(origin, $, companyName);
      if (legalDM && legalDM.confidence >= 75) {
        console.log(`[DM Engine] Layer 3 Success (Legal Page): Found ${legalDM.name} for ${baseUrl}`);
        return legalDM;
      }
    }

    // ------------------------------------------------------------------------
    // LAYER 4: Free US Federal NPI Registry ($0 Cost, Government API)
    // Healthcare & clinic queries only
    // ------------------------------------------------------------------------
    const isMedical = /medical|health|clinic|dent|spa|chiro|physic|care|doctor|wellness/i.test(industry);
    if (companyName && isMedical) {
      const npiDM = await lookupNpiRegistry(companyName, state, city);
      if (npiDM) {
        console.log(`[DM Engine] Layer 4 Success (NPI Registry): Found ${npiDM.name} (${npiDM.role}) for ${companyName}`);
        return {
          name: npiDM.name,
          firstName: npiDM.firstName,
          lastName: npiDM.lastName,
          role: npiDM.role,
          confidence: npiDM.confidence,
          source: 'NPI_REGISTRY',
          evidenceText: npiDM.evidenceText,
        };
      }
    }

  } catch (err: any) {
    console.error('[DM Engine Crash / Fallback]:', err?.message || err);
  }

  // --------------------------------------------------------------------------
  // LAYER 5: Safe Handling Fallback (0 Hallucinations / 100% Safe Send)
  // --------------------------------------------------------------------------
  console.log(`[DM Engine] Founder hidden for ${baseUrl}. Gracefully falling back to Safe Handling.`);
  return {
    name: 'Team',
    firstName: null,
    lastName: null,
    role: 'UNKNOWN',
    confidence: 0,
    source: 'NOT_FOUND',
    evidenceText: 'No verified founder or director publicly disclosed across on-site and federal registries.',
  };
}
