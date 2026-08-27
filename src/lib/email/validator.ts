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

export async function verifyEmailHttpBridge(email: string | null | undefined, allowCatchAll: boolean = false): Promise<boolean> {
  if (!email || !email.includes('@')) return false;

  const domain = email.split('@')[1].toLowerCase();

  // If we are strictly checking guesses (allowCatchAll=false) and we already know 
  // this domain is a Catch-All, instantly reject without spending API credits!
  if (!allowCatchAll && catchAllCache.has(domain)) {
    console.log(`[Validation] Instantly rejected ${email} (Domain ${domain} is cached as Catch-All)`);
    return false;
  }

  // Basic syntax & MX record pre-filter: If domain doesn't even have MX records, reject immediately
  const hasMx = await hasValidMxRecords(email);
  if (!hasMx) {
    console.log(`[Validation] Rejected ${email}: Domain ${domain} has no valid MX records.`);
    return false;
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
          return true;
        }
        if (entry.classification === 'CatchAll') {
          console.log(`[Validation] Verifalia: ${email} is CatchAll (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return allowCatchAll;
        }
        if (entry.classification === 'Undeliverable') {
          console.log(`[Validation] Verifalia: ${email} is UNDELIVERABLE.`);
          return false;
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
          return true;
        }
        if (data.Status === 'Catch-All') {
          console.log(`[Validation] MyEmailVerifier: ${email} is Catch-All (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return allowCatchAll;
        }
        if (data.Status === 'Invalid') {
          console.log(`[Validation] MyEmailVerifier: ${email} is INVALID.`);
          return false;
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
          return true;
        }
        if (data.state === 'catch_all') {
          console.log(`[Validation] EmailAwesome: ${email} is Catch-All (allowCatchAll=${allowCatchAll})`);
          catchAllCache.add(domain);
          return allowCatchAll;
        }
        if (data.state === 'undeliverable') {
          console.log(`[Validation] EmailAwesome: ${email} is UNDELIVERABLE.`);
          return false;
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
          return true;
        }
      }
    }
  } catch (err) {
    console.warn(`[Validation] AnyMailFinder verification check warning:`, err);
  }

  // STRICT RULE: If no API could strictly confirm this email is Deliverable/Valid, REJECT it to protect sender domain reputation!
  console.log(`[Validation] Strict Filter: ${email} could not be confirmed as deliverable by verification APIs. Rejecting email.`);
  return false;
}
