import dns from 'dns/promises';
import { scoreMxRecords, verifyEmailWithDetails, checkGravatar, verifyLinkedInProfileExists } from '@/lib/email/validator';
import { cleanLinkedinUrl } from './business-identity';
import { isPlaceholderEmail, getPlaceholderReason } from './placeholders';

export interface WebsiteCheckResult {
  isLive: boolean;
  statusCode?: number;
  errorReason?: string;
  domain?: string;
}

export interface LinkedinCheckResult {
  exists: boolean;
  status: 'VERIFIED' | 'FOUND_BY_SEARCH' | 'UNCONFIRMED' | 'INVALID_URL' | 'NOT_FOUND';
  url?: string | null;
  errorReason?: string;
}

export interface EmailInboxCheckResult {
  isValid: boolean;
  isDeliverable: boolean;
  verifier: string;
  isCatchAll: boolean;
  provider: string;
  hasGravatar: boolean;
  deliverabilityScore: number; // 0-100
  bounceRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  reason?: string;
}

export interface LeadVerificationReport {
  website: WebsiteCheckResult;
  linkedin: LinkedinCheckResult;
  email: EmailInboxCheckResult;
  overallScore: number; // 0-100
  isEligibleToSave: boolean;
  blockReason?: string;
}

/**
 * Checks if a website exists and is reachable via DNS and HTTP/HTTPS probe.
 */
export async function verifyWebsiteExists(rawUrl?: string | null): Promise<WebsiteCheckResult> {
  if (!rawUrl) {
    return { isLive: false, errorReason: 'Missing website URL' };
  }

  const cleanDomain = rawUrl
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];

  if (!cleanDomain || cleanDomain.includes(' ') || !cleanDomain.includes('.')) {
    return { isLive: false, errorReason: 'Invalid domain syntax' };
  }

  // SSRF guard for private/cloud metadata ranges
  if (
    ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(cleanDomain) ||
    cleanDomain.startsWith('10.') ||
    cleanDomain.startsWith('192.168.') ||
    cleanDomain.startsWith('172.16.')
  ) {
    return { isLive: false, errorReason: 'Blocked private host' };
  }

  // 1. DNS Resolution check (fast proof domain exists)
  try {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('DNS Timeout')), 2500)
    );
    await Promise.race([dns.lookup(cleanDomain), timeout]);
  } catch (err: any) {
    return { isLive: false, domain: cleanDomain, errorReason: 'Website domain does not exist (DNS lookup failed)' };
  }

  // 2. HTTP/HTTPS Reachability probe
  const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://${cleanDomain}`;
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4000),
      redirect: 'follow'
    });

    // Any HTTP status under 500 (even 403 like Cloudflare protection or 301 redirects) proves server is live!
    if (res.status < 500) {
      return { isLive: true, statusCode: res.status, domain: cleanDomain };
    }
    return { isLive: false, statusCode: res.status, domain: cleanDomain, errorReason: `Website server returned HTTP ${res.status}` };
  } catch {
    // Fallback: try http://
    try {
      const fallbackUrl = `http://${cleanDomain}`;
      const res = await fetch(fallbackUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3000),
        redirect: 'follow'
      });
      if (res.status < 500) {
        return { isLive: true, statusCode: res.status, domain: cleanDomain };
      }
    } catch {
      // Both attempts failed
    }
    return { isLive: false, domain: cleanDomain, errorReason: 'Website is down or unreachable' };
  }
}

/**
 * Verifies if a founder LinkedIn profile URL exists or can be located.
 */
export async function verifyLinkedinProfile(
  rawLinkedinUrl?: string | null,
  founderName?: string | null,
  companyDomain?: string | null
): Promise<LinkedinCheckResult> {
  const cleanedUrl = cleanLinkedinUrl(rawLinkedinUrl);

  // If a LinkedIn URL was explicitly provided in the CSV
  if (rawLinkedinUrl && rawLinkedinUrl.trim()) {
    if (!cleanedUrl) {
      return { exists: false, status: 'INVALID_URL', errorReason: 'Invalid LinkedIn URL format (Must be /in/ or /company/)' };
    }

    try {
      const res = await fetch(cleanedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(3500),
        redirect: 'follow'
      });

      // 404 means profile is deleted or not found
      if (res.status === 404) {
        return { exists: false, status: 'NOT_FOUND', url: cleanedUrl, errorReason: 'LinkedIn profile does not exist (HTTP 404)' };
      }

      // If status 200, check if it's an error page
      if (res.status === 200) {
        const text = await res.text();
        if (text.includes('Page not found') || text.includes("This page doesn't exist") || text.includes('profile-unavailable')) {
          return { exists: false, status: 'NOT_FOUND', url: cleanedUrl, errorReason: 'LinkedIn profile page does not exist' };
        }
        return { exists: true, status: 'VERIFIED', url: cleanedUrl };
      }

      // If LinkedIn returns 999 bot challenge or 403, check Google search index to verify real existence
      if (res.status === 999 || res.status === 403) {
        const handle = cleanedUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0];
        if (handle && handle.length > 2) {
          const query = `site:linkedin.com/in/${handle}`;
          const serperKey = process.env.SERPER_API_KEY;
          if (serperKey) {
            try {
              const sRes = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query, num: 1 }),
                signal: AbortSignal.timeout(3000)
              });
              if (sRes.ok) {
                const sData = await sRes.json();
                if (Array.isArray(sData.organic) && sData.organic.length > 0) {
                  return { exists: true, status: 'VERIFIED', url: cleanedUrl };
                }
              }
            } catch {
              // Ignore Serper error and fall through
            }
          }
        }
        return { exists: false, status: 'NOT_FOUND', url: cleanedUrl, errorReason: 'LinkedIn profile not found or deleted' };
      }

      return { exists: true, status: 'VERIFIED', url: cleanedUrl };
    } catch {
      // If network probe times out, accept format if clean
      return { exists: true, status: 'VERIFIED', url: cleanedUrl };
    }
  }

  // If no URL was provided, but founder name + domain exist, search Serper
  if (founderName && companyDomain) {
    const parts = founderName.trim().split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    if (firstName && lastName) {
      try {
        const found = await verifyLinkedInProfileExists(firstName, lastName, companyDomain);
        if (found) {
          return { exists: true, status: 'FOUND_BY_SEARCH', url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(founderName + ' ' + companyDomain)}` };
        }
      } catch {
        // Fallback
      }
    }
  }

  return { exists: false, status: 'UNCONFIRMED', errorReason: 'No LinkedIn profile linked' };
}

/**
 * Deep Real-Inbox Deliverability & Bounce Protection Check.
 */
export async function verifyRealInbox(email?: string | null): Promise<EmailInboxCheckResult> {
  if (!email || !email.includes('@')) {
    return {
      isValid: false,
      isDeliverable: false,
      verifier: 'None',
      isCatchAll: false,
      provider: 'None',
      hasGravatar: false,
      deliverabilityScore: 0,
      bounceRisk: 'HIGH',
      reason: 'Missing email address'
    };
  }

  const cleanEmail = email.toLowerCase().trim();

  // 1. Placeholder & Syntax Check
  if (isPlaceholderEmail(cleanEmail)) {
    return {
      isValid: false,
      isDeliverable: false,
      verifier: 'PlaceholderFilter',
      isCatchAll: false,
      provider: 'None',
      hasGravatar: false,
      deliverabilityScore: 0,
      bounceRisk: 'HIGH',
      reason: `Placeholder address detected (${getPlaceholderReason(cleanEmail)})`
    };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(cleanEmail)) {
    return {
      isValid: false,
      isDeliverable: false,
      verifier: 'SyntaxValidator',
      isCatchAll: false,
      provider: 'None',
      hasGravatar: false,
      deliverabilityScore: 0,
      bounceRisk: 'HIGH',
      reason: 'Invalid email syntax format'
    };
  }

  // 2. MX Quality & Mail Server Check
  const domain = cleanEmail.split('@')[1];
  const mx = await scoreMxRecords(domain);

  if (!mx.hasMx) {
    return {
      isValid: false,
      isDeliverable: false,
      verifier: 'DnsMx',
      isCatchAll: false,
      provider: 'None',
      hasGravatar: false,
      deliverabilityScore: 0,
      bounceRisk: 'HIGH',
      reason: 'Domain has no active Mail Exchange (MX) records (100% bounce risk)'
    };
  }

  // 3. Gravatar Account Check (Instant proof of active account)
  const hasGravatar = await checkGravatar(cleanEmail);

  // 4. Verifalia SDK & Multi-tier Waterfall Verification
  let verifierName = 'None';
  let isDeliverable = false;
  let isCatchAll = false;

  try {
    const vRes = await verifyEmailWithDetails(cleanEmail, true);
    verifierName = vRes.verifier;
    isDeliverable = vRes.isValid;
    isCatchAll = vRes.isCatchAll;
  } catch (err: any) {
    console.warn('[Inbox Verifier] Verifier warning:', err?.message || err);
  }

  // Compute confidence score
  let score = 0;
  score += Math.round(mx.score * 0.4); // Up to 38 pts for Google / Microsoft 365
  if (hasGravatar) score += 25;

  if (verifierName !== 'None') {
    if (isDeliverable && !isCatchAll) score += 35;
    else if (isCatchAll) score += 10;
  } else {
    // Verifier was unconfigured or timed out, but MX is active
    verifierName = `DNS MX (${mx.provider})`;
    isDeliverable = true;
    score += 25;
  }

  const finalScore = Math.min(score, 100);
  let bounceRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  if (!isDeliverable) {
    bounceRisk = 'HIGH';
  } else if (isCatchAll && !hasGravatar) {
    bounceRisk = 'MEDIUM';
  } else {
    bounceRisk = 'LOW';
  }

  const isValid = bounceRisk !== 'HIGH';

  return {
    isValid,
    isDeliverable,
    verifier: verifierName,
    isCatchAll,
    provider: mx.provider,
    hasGravatar,
    deliverabilityScore: finalScore,
    bounceRisk,
    reason: !isValid ? 'Undeliverable inbox rejected by mail server' : undefined
  };
}

/**
 * Runs complete 360-degree verification on a lead.
 */
export async function verifyLeadComprehensive(lead: {
  websiteUrl?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  founderName?: string | null;
  companyName?: string | null;
}): Promise<LeadVerificationReport> {
  const [website, linkedin, email] = await Promise.all([
    verifyWebsiteExists(lead.websiteUrl),
    verifyLinkedinProfile(lead.linkedinUrl, lead.founderName, lead.websiteUrl),
    verifyRealInbox(lead.email)
  ]);

  let overallScore = 0;
  if (website.isLive) overallScore += 30;
  if (linkedin.exists) overallScore += 20;
  overallScore += Math.round(email.deliverabilityScore * 0.5);

  let isEligibleToSave = true;
  let blockReason: string | undefined = undefined;

  // Strict Bounce & Quality Gates:
  if (!email.isValid || email.bounceRisk === 'HIGH') {
    isEligibleToSave = false;
    blockReason = email.reason || 'Undeliverable inbox (bounce risk)';
  } else if (!website.isLive) {
    isEligibleToSave = false;
    blockReason = website.errorReason || 'Target website does not exist or is down';
  }

  return {
    website,
    linkedin,
    email,
    overallScore: Math.min(overallScore, 100),
    isEligibleToSave,
    blockReason
  };
}
