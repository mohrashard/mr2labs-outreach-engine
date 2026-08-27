import dns from 'dns/promises';

/**
 * Validates whether the domain of an email address has active MX (Mail Exchange) records.
 * Uses native Node.js dns/promises resolveMx.
 */
export async function hasValidMxRecords(email: string | null | undefined): Promise<boolean> {
  if (!email || !email.includes('@')) return false;

  const parts = email.trim().split('@');
  const domain = parts[parts.length - 1].toLowerCase();

  if (!domain || domain.includes(' ') || !domain.includes('.')) {
    return false;
  }

  const timeout = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('DNS Timeout')), 3000)
  );

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      timeout
    ]);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (err) {
    // DNS resolution error (e.g., ENOTFOUND, SERVFAIL, ENODATA, DNS Timeout)
    return false;
  }
}

import { VerifaliaRestClient, WaitOptions } from 'verifalia';

/**
 * 3-Step HTTP API Bridge for Vercel
 * Tier 1: Verifalia (SDK)
 * Tier 2: Verify My Email (HTTP Fallback 1)
 * Tier 3: EmailAwesome (HTTP Fallback 2)
 * Tier 4: Native MX Checker (Last resort)
 */
const catchAllCache = new Set<string>();

export interface DetailedVerificationResult {
  isValid: boolean;
  verifier: 'Verifalia' | 'MyEmailVerifier' | 'EmailAwesome' | 'AnyMailFinder' | 'None';
  isCatchAll: boolean;
}

export async function verifyEmailWithDetails(
  email: string | null | undefined, 
  allowCatchAll: boolean = false
): Promise<DetailedVerificationResult> {
  if (!email || !email.includes('@')) return { isValid: false, verifier: 'None', isCatchAll: false };

  const domain = email.split('@')[1].toLowerCase();

  if (!allowCatchAll && catchAllCache.has(domain)) {
    console.log(`[Validation] Instantly rejected ${email} (Domain ${domain} is cached as Catch-All)`);
    return { isValid: false, verifier: 'None', isCatchAll: true };
  }

  const hasMx = await hasValidMxRecords(email);
  if (!hasMx) {
    console.log(`[Validation] Rejected ${email}: Domain ${domain} has no valid MX records.`);
    return { isValid: false, verifier: 'None', isCatchAll: false };
  }

  console.log(`[Validation] Running strict verification waterfall for: ${email}`);

  // Tier 1: Verifalia (SDK)
  try {
    const verifaliaEmail = process.env.VERIFALIA_EMAIL;
    const verifaliaPw = process.env.VERIFALIA_PW;
    
    if (verifaliaEmail && verifaliaPw) {
      console.log(`[Validation] Testing with Verifalia SDK...`);
      const verifalia = new VerifaliaRestClient({
        username: verifaliaEmail,
        password: verifaliaPw
      });
      
      const job = await verifalia.emailValidations.submit(email, WaitOptions.default);
      
      if (job && job.entries && job.entries.length > 0) {
        const entry = job.entries[0];
        if (entry.classification === 'Deliverable') {
          console.log(`[Validation] Verifalia: ${email} is DELIVERABLE!`);
          return { isValid: true, verifier: 'Verifalia', isCatchAll: false };
        }
        if (entry.classification === 'CatchAll') {
          console.log(`[Validation] Verifalia: ${email} is CatchAll (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return { isValid: allowCatchAll, verifier: 'Verifalia', isCatchAll: true };
        }
        if (entry.classification === 'Undeliverable') {
          console.log(`[Validation] Verifalia: ${email} is UNDELIVERABLE.`);
          return { isValid: false, verifier: 'Verifalia', isCatchAll: false };
        }
      }
    }
  } catch (err) {
    console.warn(`[Validation] Verifalia failed or timed out. Cascading to Tier 2...`);
  }

  // Tier 2: MyEmailVerifier (100/day Free)
  try {
    const mevKey = process.env.VERIFY_MY_EMAIL || process.env.MY_EMAIL_VERIFIER;
    if (mevKey) {
      console.log(`[Validation] Testing with MyEmailVerifier...`);
      const res = await fetch(`https://clientapi.myemailverifier.com/verifier/validate_single/${encodeURIComponent(email)}/${mevKey}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.Status === 'Valid') {
          console.log(`[Validation] MyEmailVerifier: ${email} is VALID!`);
          return { isValid: true, verifier: 'MyEmailVerifier', isCatchAll: false };
        }
        if (data.Status === 'Catch-All') {
          console.log(`[Validation] MyEmailVerifier: ${email} is Catch-All (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return { isValid: allowCatchAll, verifier: 'MyEmailVerifier', isCatchAll: true };
        }
        if (data.Status === 'Invalid') {
          console.log(`[Validation] MyEmailVerifier: ${email} is INVALID.`);
          return { isValid: false, verifier: 'MyEmailVerifier', isCatchAll: false };
        }
      }
    }
  } catch (err) {
    console.warn(`[Validation] MyEmailVerifier failed or timed out. Cascading to Tier 3...`);
  }

  // Tier 3: EmailAwesome
  try {
    const awesomeKey = process.env.EMAIL_AWESOME;
    if (awesomeKey) {
      console.log(`[Validation] Testing with EmailAwesome...`);
      const res = await fetch(`https://api.emailawesome.com/v1/verify?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${awesomeKey}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000) 
      });

      if (res.ok) {
        const data = await res.json();
        if (data.state === 'deliverable' || data.is_valid === true) {
          console.log(`[Validation] EmailAwesome: ${email} is DELIVERABLE!`);
          return { isValid: true, verifier: 'EmailAwesome', isCatchAll: false };
        }
        if (data.state === 'catch_all') {
          console.log(`[Validation] EmailAwesome: ${email} is Catch-All (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return { isValid: allowCatchAll, verifier: 'EmailAwesome', isCatchAll: true };
        }
        if (data.state === 'undeliverable') {
          console.log(`[Validation] EmailAwesome: ${email} is UNDELIVERABLE.`);
          return { isValid: false, verifier: 'EmailAwesome', isCatchAll: false };
        }
      }
    }
  } catch (err) {
    console.warn(`[Validation] EmailAwesome failed or timed out.`);
  }

  // Tier 4: AnyMailFinder Verification Fallback
  try {
    const amfKey = process.env.ANY_MAIL_FINDER;
    if (amfKey) {
      console.log(`[Validation] Testing with AnyMailFinder...`);
      const res = await fetch(`https://api.anymailfinder.com/v5.0/search/email.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${amfKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email_class === 'verified' || data.status === 'valid') {
          console.log(`[Validation] AnyMailFinder: ${email} is VERIFIED!`);
          return { isValid: true, verifier: 'AnyMailFinder', isCatchAll: false };
        }
      }
    }
  } catch (err) {
    console.warn(`[Validation] AnyMailFinder verification check warning:`, err);
  }

  console.log(`[Validation] Strict Filter: ${email} could not be confirmed as deliverable by verification APIs. Rejecting email.`);
  return { isValid: false, verifier: 'None', isCatchAll: false };
}

export async function verifyEmailHttpBridge(email: string | null | undefined, allowCatchAll: boolean = false): Promise<boolean> {
  const result = await verifyEmailWithDetails(email, allowCatchAll);
  return result.isValid;
}

import crypto from 'crypto';

export async function scoreMxRecords(domain: string): Promise<{
  hasMx: boolean;
  provider: string;
  score: number;
}> {
  try {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('DNS Timeout')), 3000)
    );
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      timeout
    ]) as { exchange: string; priority: number }[];

    if (!mxRecords || mxRecords.length === 0) {
      return { hasMx: false, provider: 'None', score: 0 };
    }

    const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
    const topMx = sorted[0].exchange.toLowerCase();

    const providerMap: Record<string, { name: string; score: number }> = {
      'google.com': { name: 'Google Workspace', score: 95 },
      'googlemail.com': { name: 'Google Workspace', score: 95 },
      'outlook.com': { name: 'Microsoft 365', score: 95 },
      'protection.outlook.com': { name: 'Microsoft 365', score: 95 },
      'zoho.com': { name: 'Zoho Mail', score: 85 },
      'mimecast.com': { name: 'Mimecast', score: 90 },
      'proofpoint.com': { name: 'Proofpoint', score: 90 },
      'pphosted.com': { name: 'Proofpoint', score: 90 },
    };

    for (const [suffix, info] of Object.entries(providerMap)) {
      if (topMx.includes(suffix)) {
        return { hasMx: true, provider: info.name, score: info.score };
      }
    }

    return { hasMx: true, provider: 'Custom MX', score: 70 };
  } catch {
    return { hasMx: false, provider: 'None', score: 0 };
  }
}

export async function checkGravatar(email: string): Promise<boolean> {
  try {
    const hash = crypto
      .createHash('md5')
      .update(email.toLowerCase().trim())
      .digest('hex');

    const res = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    });

    return res.status === 200;
  } catch {
    return false;
  }
}

export async function verifyLinkedInProfileExists(
  firstName: string,
  lastName: string,
  companyDomain: string
): Promise<boolean> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return false;

  try {
    const query = `site:linkedin.com/in/ "${firstName} ${lastName}" "${companyDomain}"`;
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: 3 }),
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.organic) && data.organic.length > 0;
  } catch {
    return false;
  }
}

export interface EmailConfidenceResult {
  email: string;
  score: number;
  signals: string[];
  decision: 'SEND' | 'HOLD' | 'REJECT';
  verifier: string;
}

export async function scoreEmailConfidence(
  email: string,
  source: 'DOM' | 'GUESSED',
  founderFirstName?: string,
  founderLastName?: string
): Promise<EmailConfidenceResult> {
  if (!email || !email.includes('@')) {
    return { email: email || '', score: 0, signals: ['invalid-format'], decision: 'REJECT', verifier: 'None' };
  }

  const domain = email.split('@')[1].toLowerCase().trim();
  const signals: string[] = [];
  let score = 0;

  // 1. Source bonus: DOM-scraped starts with strong prior (+40 pts)
  if (source === 'DOM') {
    score += 40;
    signals.push('dom-scraped');
  }

  // 2. MX record quality check
  const mx = await scoreMxRecords(domain);
  if (!mx.hasMx) {
    return { email, score: 0, signals: ['no-mx-records'], decision: 'REJECT', verifier: 'None' };
  }
  score += Math.round(mx.score * 0.3);
  signals.push(`mx:${mx.provider}`);

  // 3. Verifier result (with catch-all awareness)
  const vRes = await verifyEmailWithDetails(email, true);
  let verifierName: string = vRes.verifier;

  if (vRes.isValid && !vRes.isCatchAll) {
    score += 35;
    signals.push('smtp-verified');
  } else if (vRes.isCatchAll) {
    score += 10;
    signals.push('catch-all-domain');
    if (source === 'DOM') {
      verifierName = `${vRes.verifier}:catchall-dom-accepted`;
    }
  } else if (vRes.verifier !== 'None') {
    return { email, score: 0, signals: ['smtp-undeliverable'], decision: 'REJECT', verifier: vRes.verifier };
  } else {
    signals.push('verifier-unavailable');
  }

  // 4. Gravatar check (100% free)
  const hasGravatar = await checkGravatar(email);
  if (hasGravatar) {
    score += 20;
    signals.push('gravatar-hit');
  }

  // 5. LinkedIn profile check (if GUESSED and founder name present)
  if (source === 'GUESSED' && founderFirstName && founderLastName) {
    const linkedinExists = await verifyLinkedInProfileExists(founderFirstName, founderLastName, domain);
    if (linkedinExists) {
      score += 15;
      signals.push('linkedin-verified');
    }
  }

  const finalScore = Math.min(score, 100);

  let decision: 'SEND' | 'HOLD' | 'REJECT' = 'REJECT';
  if (vRes.isCatchAll && source === 'GUESSED' && !hasGravatar) {
    decision = 'REJECT';
    console.log(`[Confidence Engine] Rejecting guessed catch-all email without gravatar: ${email} (Score: ${finalScore})`);
  } else if (finalScore >= 50) {
    decision = 'SEND';
  } else if (finalScore >= 35) {
    decision = 'HOLD';
  }

  console.log(`[Confidence Engine] ${email} -> Score: ${finalScore}/100 | Decision: ${decision} | Signals: ${signals.join(', ')}`);

  return {
    email,
    score: finalScore,
    signals,
    decision,
    verifier: verifierName
  };
}
