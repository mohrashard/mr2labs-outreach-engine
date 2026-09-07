import * as cheerio from 'cheerio';
import { 
  verifyWebsiteExists, 
  verifyLinkedinProfile, 
  verifyRealInbox, 
  verifyLeadComprehensive,
  LeadVerificationReport 
} from './import-verifier';
import { cleanLinkedinUrl } from './business-identity';
import { findDecisionMakerFree, splitPersonName } from '@/lib/scraper/decision-maker';
import { BLACKLISTED_DOMAINS } from '@/lib/scraper/discovery';
import { isValidLeadEmail } from '@/lib/scraper/enrichment';

export interface AutoHealResult {
  healedLead: {
    rowIndex: number;
    companyName: string;
    founderName: string | null;
    email: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
    instagramUrl: string | null;
    painPoint: string | null;
    mr2Solution: string | null;
    raw: any;
  };
  report: LeadVerificationReport;
  autoHealed: {
    website: boolean;
    linkedin: boolean;
    email: boolean;
    founder: boolean;
  };
  originalData: {
    websiteUrl: string | null;
    linkedinUrl: string | null;
    email: string | null;
    founderName: string | null;
  };
}

/**
 * Searches Google Serper API with multi-key pooling fallback.
 */
async function querySerper(query: string, limit: number = 5): Promise<any[]> {
  const parseKeys = (val?: string) => (val || '').split(',').map(k => k.trim()).filter(Boolean);
  const keys = Array.from(new Set([
    ...parseKeys(process.env.SERPER_API_KEY),
    ...parseKeys(process.env.SERPER_API_KEYS)
  ]));

  if (keys.length === 0) return [];

  for (const key of keys) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query, num: limit }),
        signal: AbortSignal.timeout(4500)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.organic) && data.organic.length > 0) {
          return data.organic;
        }
      }
    } catch (err: any) {
      console.warn(`[Serper Auto-Healer] Key ${key.slice(0, 6)}... failed:`, err?.message || err);
    }
  }

  // Fallback to SerpApi if available
  const serpApiKeys = parseKeys(process.env.SERP_API || process.env.SERPAPI_API_KEY);
  for (const key of serpApiKeys) {
    try {
      const res = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&engine=google`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.organic_results) && data.organic_results.length > 0) {
          return data.organic_results.map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
          }));
        }
      }
    } catch {
      // Ignore fallback error
    }
  }

  return [];
}

/**
 * 1. WEBSITE AUTO-HEALING: Finds real official website when provided link is dead or wrong.
 */
export async function searchRealWebsite(companyName: string): Promise<string | null> {
  if (!companyName || companyName.length < 2) return null;

  const cleanName = companyName
    .replace(/\b(inc|llc|ltd|corp|co|group)\b/gi, '')
    .trim();

  const queries = [
    `"${cleanName}" official website`,
    `"${cleanName}" business website`
  ];

  for (const q of queries) {
    const results = await querySerper(q, 5);

    for (const item of results) {
      const rawLink = item.link || item.url;
      if (!rawLink) continue;

      try {
        const parsed = new URL(rawLink.startsWith('http') ? rawLink : `https://${rawLink}`);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

        // Skip directories, review platforms, academic and government networks
        if (
          BLACKLISTED_DOMAINS.some(blocked => host.includes(blocked)) ||
          host.endsWith('.org') ||
          host.endsWith('.gov') ||
          host.endsWith('.edu') ||
          host.includes('.ac.')
        ) {
          continue;
        }

        // Domain must share at least one keyword with company name
        const nameKeywords = cleanName.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        const hasKeywordMatch = nameKeywords.length === 0 || nameKeywords.some(k => host.includes(k));
        if (!hasKeywordMatch) {
          continue;
        }

        const candidateUrl = `${parsed.protocol}//${parsed.hostname}`;
        const check = await verifyWebsiteExists(candidateUrl);
        if (check.isLive) {
          console.log(`[Auto-Healer] 🌐 Successfully recovered real website for "${companyName}": ${candidateUrl}`);
          return candidateUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * 2. FOUNDER LINKEDIN AUTO-HEALING: Finds real LinkedIn profile when link is dead 404 or missing.
 */
export async function searchRealLinkedin(
  companyName: string,
  founderName?: string | null,
  websiteUrl?: string | null
): Promise<{ url: string | null; founderName?: string | null; status: 'FOUND_BY_SEARCH' | 'VERIFIED' | 'UNCONFIRMED' }> {
  let effectiveFounder = founderName?.trim() || null;

  // If founder name is missing but we have a live website, discover it on-site first
  if (!effectiveFounder && websiteUrl) {
    try {
      const dmResult = await findDecisionMakerFree(websiteUrl, companyName);
      if (dmResult && dmResult.name && dmResult.name !== 'Team' && dmResult.confidence >= 75) {
        effectiveFounder = dmResult.name;
        console.log(`[Auto-Healer] 💡 Discovered founder on-site for ${companyName}: "${effectiveFounder}" (${dmResult.role})`);
      }
    } catch {
      // Fallback
    }
  }

  // A. Search by Founder Name + Company
  if (effectiveFounder) {
    const queries = [
      `site:linkedin.com/in/ "${effectiveFounder}" "${companyName}"`,
      `site:linkedin.com/in/ "${effectiveFounder}"`
    ];

    for (const q of queries) {
      const results = await querySerper(q, 3);
      for (const item of results) {
        const link = item.link || item.url;
        const cleaned = cleanLinkedinUrl(link);
        if (cleaned && cleaned.includes('/in/')) {
          console.log(`[Auto-Healer] 💼 Discovered founder LinkedIn profile: ${cleaned}`);
          return { url: cleaned, founderName: effectiveFounder, status: 'FOUND_BY_SEARCH' };
        }
      }
    }
  }

  // B. Search by Company Name (Leader / Executive)
  const companyQueries = [
    `site:linkedin.com/in/ ("Founder" OR "CEO" OR "Owner" OR "Director") "${companyName}"`,
    `site:linkedin.com/company/ "${companyName}"`
  ];

  for (const q of companyQueries) {
    const results = await querySerper(q, 3);
    for (const item of results) {
      const link = item.link || item.url;
      const cleaned = cleanLinkedinUrl(link);
      if (cleaned) {
        console.log(`[Auto-Healer] 💼 Discovered corporate/leader LinkedIn: ${cleaned}`);
        return { url: cleaned, founderName: effectiveFounder, status: 'FOUND_BY_SEARCH' };
      }
    }
  }

  return { url: null, founderName: effectiveFounder, status: 'UNCONFIRMED' };
}

/**
 * 3. REAL INBOX AUTO-HEALING: Finds real working inbox when email is dead, missing, or bounced.
 */
export async function discoverWorkingEmail(
  companyName: string,
  websiteUrl: string,
  founderName?: string | null
): Promise<{ email: string; verifier: string; deliverabilityScore: number } | null> {
  const cleanDomain = websiteUrl
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  if (!cleanDomain || cleanDomain.includes(' ')) return null;

  const testedEmails = new Set<string>();

  // --- Phase 1: On-Site DOM Scraping (Homepage, /contact, /about) ---
  const targetPages = [
    `https://${cleanDomain}`,
    `https://${cleanDomain}/contact`,
    `https://${cleanDomain}/contact-us`,
    `https://${cleanDomain}/about`,
    `https://${cleanDomain}/about-us`
  ];

  for (const pageUrl of targetPages) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(3500),
        redirect: 'follow'
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove noise tags
      $('script, style, noscript, svg').remove();
      const textAndLinks = $.html().toLowerCase();

      const regexMatches = textAndLinks.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

      for (const rawCandidate of regexMatches) {
        const candidate = rawCandidate.toLowerCase().trim();
        if (testedEmails.has(candidate)) continue;
        testedEmails.add(candidate);

        if (!isValidLeadEmail(candidate)) continue;

        // Candidate must be on the domain or a clean business address
        const candidateDomain = candidate.split('@')[1];
        if (!candidateDomain || (!cleanDomain.includes(candidateDomain.split('.')[0]) && !['gmail.com', 'outlook.com'].includes(candidateDomain))) {
          continue;
        }

        const vCheck = await verifyRealInbox(candidate);
        if (vCheck.isValid && vCheck.bounceRisk !== 'HIGH') {
          console.log(`[Auto-Healer] 📧 Recovered real inbox via on-site DOM for ${companyName}: ${candidate} (Score: ${vCheck.deliverabilityScore}%)`);
          return {
            email: candidate,
            verifier: `${vCheck.verifier} (On-Site Crawl)`,
            deliverabilityScore: vCheck.deliverabilityScore
          };
        }
      }
    } catch {
      // Continue to next page
    }
  }

  // --- Phase 2: Corporate Founder Permutation Engine ---
  if (founderName) {
    const { firstName, lastName } = splitPersonName(founderName);
    const cleanFirst = (firstName || '').toLowerCase().replace(/[^a-z]/g, '');
    const cleanLast = (lastName || '').toLowerCase().replace(/[^a-z]/g, '');

    const permutations: string[] = [];
    if (cleanFirst) permutations.push(`${cleanFirst}@${cleanDomain}`);
    if (cleanFirst && cleanLast) {
      permutations.push(`${cleanFirst}.${cleanLast}@${cleanDomain}`);
      permutations.push(`${cleanFirst[0]}${cleanLast}@${cleanDomain}`);
      permutations.push(`${cleanFirst}${cleanLast}@${cleanDomain}`);
    }

    for (const candidate of permutations) {
      if (testedEmails.has(candidate)) continue;
      testedEmails.add(candidate);

      const vCheck = await verifyRealInbox(candidate);
      if (vCheck.isValid && vCheck.bounceRisk !== 'HIGH') {
        console.log(`[Auto-Healer] 📧 Recovered founder inbox via permutation for ${companyName} (${cleanFirst} ${cleanLast}): ${candidate} (Score: ${vCheck.deliverabilityScore}%)`);
        return {
          email: candidate,
          verifier: `${vCheck.verifier} (Founder Permutation)`,
          deliverabilityScore: vCheck.deliverabilityScore
        };
      }
    }
  }

  // --- Phase 3: Serper Google Dork Search ---
  const dorkQuery = `"${companyName}" email OR contact "@${cleanDomain}"`;
  const dorkResults = await querySerper(dorkQuery, 3);
  for (const item of dorkResults) {
    const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
    const dorkMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    for (const rawCand of dorkMatches) {
      const candidate = rawCand.toLowerCase().trim();
      if (testedEmails.has(candidate)) continue;
      testedEmails.add(candidate);

      if (!isValidLeadEmail(candidate)) continue;

      const vCheck = await verifyRealInbox(candidate);
      if (vCheck.isValid && vCheck.bounceRisk !== 'HIGH') {
        console.log(`[Auto-Healer] 📧 Recovered real inbox via Serper search for ${companyName}: ${candidate} (Score: ${vCheck.deliverabilityScore}%)`);
        return {
          email: candidate,
          verifier: `${vCheck.verifier} (Google Dork)`,
          deliverabilityScore: vCheck.deliverabilityScore
        };
      }
    }
  }

  return null;
}

/**
 * 4. MASTER AUTO-HEALER ORCHESTRATOR
 * Evaluates initial report and automatically searches/recovers any broken attributes.
 */
export async function autoHealLeadComprehensive(
  lead: {
    companyName: string;
    founderName: string | null;
    email: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
    instagramUrl: string | null;
    painPoint: string | null;
    mr2Solution: string | null;
    raw: any;
    rowIndex: number;
  },
  initialReport: LeadVerificationReport
): Promise<AutoHealResult> {
  const autoHealed = {
    website: false,
    linkedin: false,
    email: false,
    founder: false
  };

  const originalData = {
    websiteUrl: lead.websiteUrl,
    linkedinUrl: lead.linkedinUrl,
    email: lead.email,
    founderName: lead.founderName
  };

  let workingWebsite = lead.websiteUrl;
  let workingLinkedin = lead.linkedinUrl;
  let workingEmail = lead.email;
  let workingFounder = lead.founderName;

  // 1. Check & Heal Website if dead or missing
  if (!initialReport.website.isLive || !workingWebsite) {
    console.log(`[Auto-Healer] ⚠️ Website "${workingWebsite || 'EMPTY'}" for "${lead.companyName}" is dead or missing. Attempting auto-recovery...`);
    const recoveredWebsite = await searchRealWebsite(lead.companyName);
    if (recoveredWebsite) {
      workingWebsite = recoveredWebsite;
      autoHealed.website = true;
    }
  }

  // 2. Check & Heal LinkedIn if broken, 404, or missing
  const needsLinkedinHeal = !initialReport.linkedin.exists || 
    initialReport.linkedin.status === 'NOT_FOUND' || 
    initialReport.linkedin.status === 'INVALID_URL' || 
    !workingLinkedin;

  if (needsLinkedinHeal) {
    console.log(`[Auto-Healer] ⚠️ LinkedIn profile for "${lead.companyName}" is invalid or missing. Attempting auto-discovery...`);
    const linkedinRes = await searchRealLinkedin(lead.companyName, workingFounder, workingWebsite);
    if (linkedinRes.url) {
      workingLinkedin = linkedinRes.url;
      autoHealed.linkedin = true;
    }
    if (linkedinRes.founderName && (!workingFounder || workingFounder.toLowerCase() === 'team')) {
      workingFounder = linkedinRes.founderName;
      autoHealed.founder = true;
    }
  }

  // 3. Check & Heal Email if undeliverable, missing, or high bounce risk
  const needsEmailHeal = !initialReport.email.isValid || 
    initialReport.email.bounceRisk === 'HIGH' || 
    !workingEmail;

  if (needsEmailHeal && workingWebsite) {
    console.log(`[Auto-Healer] ⚠️ Email "${workingEmail || 'EMPTY'}" for "${lead.companyName}" is undeliverable/bounced. Attempting real inbox discovery...`);
    const recoveredEmail = await discoverWorkingEmail(lead.companyName, workingWebsite, workingFounder);
    if (recoveredEmail) {
      workingEmail = recoveredEmail.email;
      autoHealed.email = true;
    }
  }

  // Re-verify the updated lead package
  const finalReport = await verifyLeadComprehensive({
    websiteUrl: workingWebsite,
    email: workingEmail,
    linkedinUrl: workingLinkedin,
    founderName: workingFounder,
    companyName: lead.companyName
  });

  return {
    healedLead: {
      ...lead,
      websiteUrl: workingWebsite,
      linkedinUrl: workingLinkedin,
      email: workingEmail,
      founderName: workingFounder
    },
    report: finalReport,
    autoHealed,
    originalData
  };
}
