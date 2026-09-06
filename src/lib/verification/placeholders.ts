// ==============================================================================
// MR² LABS OUTREACH ENGINE — PLACEHOLDER EMAIL REGISTRY & DETECTOR (v1.0.0)
// ==============================================================================

/**
 * Common prefixes and local-parts used by template engines, demo pages, and web designers.
 */
const PLACEHOLDER_PREFIXES: RegExp[] = [
  /^example/i,
  /^test/i,
  /^testing/i,
  /^youremail/i,
  /^your-email/i,
  /^yourname/i,
  /^yourcompany/i,
  /^myemail/i,
  /^user/i,
  /^admin@example/i,
  /^email@/i,
  /^name@/i,
  /^firstname@/i,
  /^lastname@/i,
  /^first\.last@/i,
  /^john\.doe@/i,
  /^jane\.doe@/i,
  /^sample/i,
  /^dummy/i,
  /^fake/i,
  /^null@/i,
  /^undefined@/i,
  /^placeholder/i,
  /^nobody@/i,
];

/**
 * Common mock, template, and test domains.
 */
const PLACEHOLDER_DOMAINS: Set<string> = new Set([
  'example.com',
  'example.org',
  'example.net',
  'mysite.com',
  'mysite.org',
  'yourdomain.com',
  'yourwebsite.com',
  'yourcompany.com',
  'company.com',
  'domain.com',
  'website.com',
  'test.com',
  'testing.com',
  'email.com',
  'sitename.com',
  'businessname.com',
  'yoursite.com',
  'templatemonster.com',
  'wixsite.com',
  'squarespace.com',
]);

/**
 * Detects if an email address is an obvious template placeholder or dummy value.
 */
export function isPlaceholderEmail(email: string): boolean {
  return getPlaceholderReason(email) !== null;
}

/**
 * Returns the exact match reason if an email is a placeholder, or null if it appears real.
 */
export function getPlaceholderReason(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return 'EMPTY_OR_NON_STRING';
  }

  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf('@');
  if (atIndex === -1) {
    return 'MISSING_AT_SYMBOL';
  }

  const localPart = normalized.slice(0, atIndex);
  const domainPart = normalized.slice(atIndex + 1);

  if (!localPart || !domainPart) {
    return 'MALFORMED_STRUCTURE';
  }

  // Check known placeholder domains
  if (PLACEHOLDER_DOMAINS.has(domainPart)) {
    return `PLACEHOLDER_DOMAIN: ${domainPart}`;
  }

  // Check if domain starts with example. or test.
  if (/^(example|test|mysite|yourdomain)\./i.test(domainPart)) {
    return `PLACEHOLDER_DOMAIN_PATTERN: ${domainPart}`;
  }

  // Check local part against placeholder patterns
  for (const pattern of PLACEHOLDER_PREFIXES) {
    if (pattern.test(normalized) || pattern.test(localPart)) {
      return `PLACEHOLDER_LOCAL_PART: ${pattern.toString()}`;
    }
  }

  return null;
}
