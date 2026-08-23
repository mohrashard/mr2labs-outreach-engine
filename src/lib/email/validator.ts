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
export async function verifyEmailHttpBridge(email: string | null | undefined, allowCatchAll: boolean = true): Promise<boolean> {
  if (!email || !email.includes('@')) return false;

  console.log(`[Validation] Running 3-step verification waterfall for: ${email}`);

  // Tier 1: Verifalia
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
        if (entry.classification === 'Deliverable') return true;
        if (entry.classification === 'CatchAll') return allowCatchAll;
        if (entry.classification === 'Undeliverable') return false;
      }
    }
  } catch (err) {
    console.warn(`[Validation] Verifalia failed or timed out. Cascading to Tier 2...`);
  }

  // Tier 2: Verify My Email
  try {
    const vmeKey = process.env.VERIFY_MY_EMAIL;
    if (vmeKey) {
      console.log(`[Validation] Testing with Verify My Email...`);
      // Note: Endpoint depends on the specific provider (e.g., app.verify-email.org or similar)
      const res = await fetch(`https://app.verify-email.org/api/v1/verifier/verify?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${vmeKey}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'valid') return true;
        if (data.status === 'catch-all') return allowCatchAll;
        if (data.status === 'invalid') return false;
      }
    }
  } catch (err) {
    console.warn(`[Validation] Verify My Email failed or timed out. Cascading to Tier 3...`);
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
        if (data.state === 'deliverable' || data.is_valid === true) return true;
        if (data.state === 'catch_all') return allowCatchAll;
        if (data.state === 'undeliverable') return false;
      }
    }
  } catch (err) {
    console.warn(`[Validation] EmailAwesome failed or timed out. Cascading to MX Check...`);
  }

  // Tier 4: Native MX check (Vercel Serverless Fallback)
  console.log(`[Validation] All APIs failed or keys missing. Executing final native MX check.`);
  return hasValidMxRecords(email);
}
