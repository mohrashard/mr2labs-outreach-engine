// ==============================================================================
// MR² LABS OUTREACH ENGINE — DUAL EMAIL QUALITY VERIFIER (v1.0.0)
// ==============================================================================

import dns from 'node:dns';
import { isPlaceholderEmail, getPlaceholderReason } from './placeholders';
import { EmailCategory } from '@/types/lead';
import { LeadEvidence } from '@/types/evidence';

const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'mail.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'yandex.com',
]);

const GENERIC_LOCAL_PARTS = new Set([
  'info',
  'hello',
  'contact',
  'inquiries',
  'inquiry',
  'help',
  'support',
  'general',
  'mail',
]);

const BUSINESS_LOCAL_PARTS = new Set([
  'office',
  'management',
  'manager',
  'admin',
  'appointments',
  'booking',
  'frontdesk',
  'reception',
  'team',
  'staff',
  'billing',
  'concierge',
]);

const DECISION_MAKER_PREFIX_PATTERNS: RegExp[] = [
  /^dr[\._\-]/i,
  /^doctor/i,
  /^founder/i,
  /^ceo/i,
  /^owner/i,
  /^director/i,
  /^president/i,
  /^principal/i,
  /^partner/i,
];

export type EmailTrustStatus =
  | 'VERIFIED'
  | 'LIKELY_VALID'
  | 'NEEDS_REVIEW'
  | 'INVALID'
  | 'PLACEHOLDER';

export interface EmailVerificationResult {
  originalEmail: string;
  normalizedEmail: string;
  isPlaceholder: boolean;
  syntaxValid: boolean;
  domainValid: boolean;
  mxValid: boolean;
  matchesBusinessDomain: boolean;
  isFreeProvider: boolean;
  emailCategory: EmailCategory;
  deliverabilityScore: number; // 0 - 100
  targetingScore: number;      // 0 - 100
  status: EmailTrustStatus;
  reasons: string[];
  evidence: LeadEvidence[];
}

/**
 * Extracts the base domain from a URL or hostname.
 * e.g. "https://www.glowmedspa.com/contact" -> "glowmedspa.com"
 * e.g. "sub.example.co.uk" -> "example.co.uk"
 */
export function extractBaseDomain(input: string): string {
  if (!input) return '';
  let cleaned = input.trim().toLowerCase();
  
  // Remove protocol if present
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\//, '').split('/')[0];
    }
  } else {
    cleaned = cleaned.split('/')[0];
  }

  // Strip port
  cleaned = cleaned.split(':')[0];

  // Strip leading www.
  cleaned = cleaned.replace(/^www\./, '');

  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;

  // Handle common two-part TLDs (e.g. co.uk, com.au, org.uk)
  const secondToLast = parts[parts.length - 2];
  if (['co', 'com', 'org', 'net', 'edu', 'gov'].includes(secondToLast) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

/**
 * Validates RFC-822 email format.
 */
export function isValidEmailSyntax(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
}

/**
 * Queries DNS MX records with a bounded timeout.
 * Returns true if at least one valid MX exchange is found.
 */
export async function checkDomainMxRecords(domain: string, timeoutMs: number = 3000): Promise<{ valid: boolean; exchanges: string[]; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ valid: false, exchanges: [], error: 'DNS_TIMEOUT' });
    }, timeoutMs);

    dns.promises.resolveMx(domain)
      .then((records) => {
        clearTimeout(timer);
        if (records && records.length > 0) {
          const exchanges = records.map((r) => r.exchange);
          resolve({ valid: true, exchanges });
        } else {
          resolve({ valid: false, exchanges: [], error: 'NO_MX_RECORDS' });
        }
      })
      .catch((err: any) => {
        clearTimeout(timer);
        resolve({ valid: false, exchanges: [], error: err.code || err.message });
      });
  });
}

/**
 * Categorizes the email to determine targeting quality.
 */
export function categorizeEmailLocalPart(localPart: string, isFreeProvider: boolean): { category: EmailCategory; targetingScore: number } {
  const normalized = localPart.toLowerCase().trim();

  // 1. Explicit Decision-Maker indicators (Dr, Owner, CEO, Founder, MD)
  for (const pattern of DECISION_MAKER_PREFIX_PATTERNS) {
    if (pattern.test(normalized)) {
      return { category: 'DECISION_MAKER', targetingScore: 95 };
    }
  }

  // 2. Known business department roles
  if (BUSINESS_LOCAL_PARTS.has(normalized)) {
    return { category: 'BUSINESS', targetingScore: 80 };
  }

  // 3. Known generic inboxes (info@, hello@, contact@)
  if (GENERIC_LOCAL_PARTS.has(normalized)) {
    return { category: 'GENERIC', targetingScore: 65 };
  }

  // 4. Free email provider (e.g. glowmedspa@gmail.com)
  if (isFreeProvider) {
    return { category: 'FREE', targetingScore: 45 };
  }

  // 5. Name heuristics (first name or first.last format, e.g. sarah@, sarah.smith@)
  if (/^[a-z]+(\.[a-z]+)?$/i.test(normalized) && normalized.length >= 3) {
    return { category: 'DECISION_MAKER', targetingScore: 90 };
  }

  return { category: 'BUSINESS', targetingScore: 75 };
}

/**
 * Comprehensive Email Verification Gate
 * Performs: normalization -> placeholder check -> RFC syntax -> domain comparison -> DNS MX -> targeting scoring.
 * Emits auditable LeadEvidence nodes.
 */
export async function verifyEmailQuality(
  rawEmail: string,
  businessWebsiteUrl: string,
  leadId: string = 'temp'
): Promise<EmailVerificationResult> {
  const reasons: string[] = [];
  const evidence: LeadEvidence[] = [];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days freshness

  if (!rawEmail) {
    return {
      originalEmail: '',
      normalizedEmail: '',
      isPlaceholder: false,
      syntaxValid: false,
      domainValid: false,
      mxValid: false,
      matchesBusinessDomain: false,
      isFreeProvider: false,
      emailCategory: 'PLACEHOLDER',
      deliverabilityScore: 0,
      targetingScore: 0,
      status: 'INVALID',
      reasons: ['EMPTY_EMAIL'],
      evidence: [],
    };
  }

  // 1. Normalization
  let normalizedEmail = rawEmail.trim().toLowerCase();
  // Strip common scraping artifacts (mailto:, trailing punctuation)
  normalizedEmail = normalizedEmail.replace(/^mailto:/i, '').replace(/[,\.;]+$/, '');

  // 2. Placeholder Check
  const placeholderReason = getPlaceholderReason(normalizedEmail);
  const isPlaceholder = placeholderReason !== null;

  if (isPlaceholder) {
    reasons.push(`PLACEHOLDER_EMAIL: ${placeholderReason}`);
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'is_placeholder_email',
      value: true,
      confidence: 100,
      source_type: 'DNS',
      evidence_text: `Identified template placeholder: ${placeholderReason}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });

    return {
      originalEmail: rawEmail,
      normalizedEmail,
      isPlaceholder: true,
      syntaxValid: false,
      domainValid: false,
      mxValid: false,
      matchesBusinessDomain: false,
      isFreeProvider: false,
      emailCategory: 'PLACEHOLDER',
      deliverabilityScore: 0,
      targetingScore: 0,
      status: 'PLACEHOLDER',
      reasons,
      evidence,
    };
  }

  // 3. Syntax Validation
  const syntaxValid = isValidEmailSyntax(normalizedEmail);
  if (!syntaxValid) {
    reasons.push('INVALID_RFC_SYNTAX');
    return {
      originalEmail: rawEmail,
      normalizedEmail,
      isPlaceholder: false,
      syntaxValid: false,
      domainValid: false,
      mxValid: false,
      matchesBusinessDomain: false,
      isFreeProvider: false,
      emailCategory: 'PLACEHOLDER',
      deliverabilityScore: 0,
      targetingScore: 0,
      status: 'INVALID',
      reasons,
      evidence,
    };
  }

  const [localPart, emailDomain] = normalizedEmail.split('@');
  const baseEmailDomain = extractBaseDomain(emailDomain);
  const baseBusinessDomain = extractBaseDomain(businessWebsiteUrl);
  const isFreeProvider = FREE_EMAIL_PROVIDERS.has(emailDomain);

  evidence.push({
    lead_id: leadId,
    category: 'EMAIL',
    claim: 'email_syntax_valid',
    value: true,
    confidence: 100,
    source_type: 'OFFICIAL_WEBSITE',
    evidence_text: `Valid RFC-822 syntax confirmed for ${normalizedEmail}`,
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // 4. Domain Matching
  const matchesBusinessDomain = Boolean(baseBusinessDomain && baseEmailDomain === baseBusinessDomain);
  if (matchesBusinessDomain) {
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'email_matches_business_domain',
      value: true,
      confidence: 95,
      source_type: 'OFFICIAL_WEBSITE',
      evidence_text: `Email domain (${emailDomain}) matches website base domain (${baseBusinessDomain})`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  } else if (isFreeProvider) {
    reasons.push(`FREE_EMAIL_PROVIDER: ${emailDomain}`);
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'free_email_provider',
      value: emailDomain,
      confidence: 90,
      source_type: 'DNS',
      evidence_text: `Free email service detected (${emailDomain}) for domain ${baseBusinessDomain}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  } else {
    reasons.push(`DOMAIN_MISMATCH: email domain (${emailDomain}) differs from website domain (${baseBusinessDomain})`);
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'domain_mismatch',
      value: { email_domain: emailDomain, website_domain: baseBusinessDomain },
      confidence: 85,
      source_type: 'DNS',
      evidence_text: `Email domain mismatch: ${emailDomain} vs ${baseBusinessDomain}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  }

  // 5. DNS MX Check (Soft Handling)
  const mxResult = await checkDomainMxRecords(emailDomain);
  const mxValid = mxResult.valid;

  if (mxValid) {
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'email_mx_valid',
      value: mxResult.exchanges,
      confidence: 100,
      source_type: 'DNS',
      evidence_text: `Active MX records found: ${mxResult.exchanges.slice(0, 2).join(', ')}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  } else {
    // SOFT PENALTY: Do not hard drop. Log as reviewable issue.
    reasons.push(`MX_LOOKUP_WARNING: ${mxResult.error || 'NO_MX'}`);
    evidence.push({
      lead_id: leadId,
      category: 'EMAIL',
      claim: 'email_mx_valid',
      value: false,
      confidence: 70,
      source_type: 'DNS',
      evidence_text: `MX resolution failed: ${mxResult.error || 'No records returned'}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  }

  // 6. Targeting Quality & Dual Scoring
  const { category: emailCategory, targetingScore } = categorizeEmailLocalPart(localPart, isFreeProvider);

  evidence.push({
    lead_id: leadId,
    category: 'EMAIL',
    claim: 'email_targeting_category',
    value: emailCategory,
    confidence: targetingScore,
    source_type: 'OFFICIAL_WEBSITE',
    evidence_text: `Local-part "${localPart}" classified as ${emailCategory} (Targeting Score: ${targetingScore})`,
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // Calculate Deliverability Score (0 - 100)
  let deliverabilityScore = 100;
  if (!mxValid) {
    deliverabilityScore -= 35; // Soft penalty for missing MX
  }
  if (!matchesBusinessDomain && !isFreeProvider) {
    deliverabilityScore -= 25; // Third-party domain mismatch penalty
  }
  if (isFreeProvider) {
    deliverabilityScore -= 10;
  }
  deliverabilityScore = Math.max(0, Math.min(100, deliverabilityScore));

  // Determine overall status
  let status: EmailTrustStatus = 'VERIFIED';
  if (deliverabilityScore >= 80 && targetingScore >= 65 && matchesBusinessDomain) {
    status = 'VERIFIED';
  } else if (deliverabilityScore >= 65) {
    status = 'LIKELY_VALID';
  } else {
    status = 'NEEDS_REVIEW';
  }

  return {
    originalEmail: rawEmail,
    normalizedEmail,
    isPlaceholder: false,
    syntaxValid: true,
    domainValid: true,
    mxValid,
    matchesBusinessDomain,
    isFreeProvider,
    emailCategory,
    deliverabilityScore,
    targetingScore,
    status,
    reasons,
    evidence,
  };
}
