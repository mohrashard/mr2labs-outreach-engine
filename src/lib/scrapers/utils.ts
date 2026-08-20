export function isValidLeadEmail(email: string): boolean {
  if (!email || email.length > 80) return false;

  const lowercase = email.toLowerCase().trim();

  // Block telemetry, error logging, and system domains
  const blockedDomains = [
    'sentry.io',
    'ingest.sentry',
    'wixpress.com',
    'sentry-next.wixpress',
    'example.com',
    'domain.com',
    'zillow.com.third',
  ];

  if (blockedDomains.some((domain) => lowercase.includes(domain))) {
    return false;
  }

  // Block dynamic scripts or malformed extensions
  if (
    lowercase.endsWith('.third') ||
    lowercase.endsWith('.png') ||
    lowercase.endsWith('.js')
  ) {
    return false;
  }

  // Strict email regex validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(lowercase);
}
