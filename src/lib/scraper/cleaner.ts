/**
 * Company Name Cleaner Utility
 * Strips page titles, SEO noise, and generic page titles like "Home" or "Contact Us"
 * to extract clean corporate brand names for lead tables and emails.
 */
export function cleanCompanyName(rawName: string | null | undefined, url: string): string {
  let name = (rawName || '').trim();

  let domainBrand = '';
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    const mainPart = host.split('.')[0];
    domainBrand = mainPart
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {}

  const isGeneric =
    !name ||
    /^(home|contact us|our team|about us|welcome|book online|privacy policy|terms of service|services|untitled|default)$/i.test(name) ||
    /book your .* appointment/i.test(name) ||
    name.length > 55;

  if (isGeneric && domainBrand) {
    return domainBrand;
  }

  name = name
    .replace(/\s*[-|–—]\s*(Home|Contact Us|Our Team|About Us|Official Site).*$/i, '')
    .replace(/^Book Your Medspa Appointment in\s*/i, '')
    .trim();

  return name || domainBrand || 'Prospect Business';
}
