// ==============================================================================
// MR² LABS OUTREACH ENGINE — BUSINESS IDENTITY & MULTI-LOCATION VERIFIER (v1.0.0)
// ==============================================================================

import * as cheerio from 'cheerio';
import { LeadEvidence } from '@/types/evidence';
import { LeadConflict } from '@/types/evidence';

export interface ExtractedAddress {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  rawText?: string | null;
}

export interface BusinessIdentityResult {
  companyName: string;
  companyNameConfidence: number;
  phone?: string | null;
  addresses: ExtractedAddress[];
  isMultiLocation: boolean;
  locationStatus: 'MATCHED' | 'MULTI_LOCATION_MATCH' | 'LOCATION_MISMATCH' | 'UNVERIFIED';
  identityScore: number; // 0 - 100
  cleanedInstagramUrl?: string | null;
  cleanedLinkedinUrl?: string | null;
  conflicts: LeadConflict[];
  evidence: LeadEvidence[];
}

/**
 * Normalizes city names for comparison (strips punctuation, trims, lowercase).
 */
function normalizeGeoString(val?: string | null): string {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Extracts and cleans Instagram profile URLs.
 * Rejects posts (/p/), reels (/reel/), stories (/stories/), tags (/explore/).
 */
export function cleanInstagramUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  
  // Rejection patterns for non-profile links
  if (/\/(p|reel|reels|stories|explore|tags|tv)\//i.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/instagram\.com\/([a-zA-Z0-9_\.]+)\/?/i);
  if (match && match[1]) {
    const handle = match[1].toLowerCase();
    // Exclude reserved paths
    if (['about', 'legal', 'developer', 'directory', 'p', 'reel', 'stories'].includes(handle)) {
      return null;
    }
    return `https://www.instagram.com/${match[1].replace(/\/$/, '')}/`;
  }
  return null;
}

/**
 * Extracts and cleans LinkedIn company or profile URLs.
 * Accepts /company/{handle} or /in/{handle}. Rejects search, posts, pulse, feed.
 */
export function cleanLinkedinUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  if (/\/(sharing|feed|posts|pulse|search|checkpoint)\//i.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/linkedin\.com\/(company|in)\/([a-zA-Z0-9_\-\.]+)\/?/i);
  if (match && match[1] && match[2]) {
    return `https://www.linkedin.com/${match[1]}/${match[2].replace(/\/$/, '')}`;
  }
  return null;
}

/**
 * Generic page title / boilerplate filter for company name detection.
 */
const GENERIC_TITLES = new Set([
  'home',
  'welcome',
  'contact',
  'contact us',
  'about',
  'about us',
  'services',
  'book now',
  'appointments',
  'untitled',
  'default',
  'index',
]);

/**
 * Resolves the best company name from JSON-LD, OpenGraph, title tag, and logo alt text.
 */
export function extractCleanCompanyName(
  $: cheerio.CheerioAPI,
  fallbackName: string
): { name: string; confidence: number; source: string } {
  // 1. Try JSON-LD Schema
  let schemaName: string | null = null;
  const ldScripts = $('script[type="application/ld+json"]').toArray();
  for (const el of ldScripts) {
    try {
      const data = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const item of items) {
        if (item.name && typeof item.name === 'string' && item.name.length > 2) {
          schemaName = item.name.trim();
          break;
        }
      }
      if (schemaName) break;
    } catch {}
  }

  if (schemaName && !GENERIC_TITLES.has(schemaName.toLowerCase())) {
    return { name: schemaName, confidence: 95, source: 'JSON_LD' };
  }

  // 2. Try og:site_name
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName && ogSiteName.trim().length > 2 && !GENERIC_TITLES.has(ogSiteName.toLowerCase())) {
    return { name: ogSiteName.trim(), confidence: 90, source: 'OG_SITE_NAME' };
  }

  // 3. Fallback name if provided and not generic
  if (fallbackName && fallbackName.trim().length > 2 && !GENERIC_TITLES.has(fallbackName.toLowerCase())) {
    return { name: fallbackName.trim(), confidence: 80, source: 'SERP_DISCOVERY' };
  }

  // 4. Try Page Title (split on pipe or dash: "Glow Medspa | Denver")
  const title = $('title').text() || '';
  if (title) {
    const segments = title.split(/[|\-–•]/).map((s) => s.trim());
    for (const seg of segments) {
      if (seg.length > 2 && !GENERIC_TITLES.has(seg.toLowerCase())) {
        return { name: seg, confidence: 70, source: 'PAGE_TITLE' };
      }
    }
  }

  return { name: fallbackName || 'Unknown Company', confidence: 30, source: 'FALLBACK' };
}

/**
 * Verifies business identity, phone, address, and checks for multi-location practices.
 */
export function verifyBusinessIdentity(
  htmlContent: string,
  targetLocation: { city?: string; state?: string } = {},
  candidateCompanyName: string = '',
  rawInstagramUrl?: string | null,
  rawLinkedinUrl?: string | null,
  leadId: string = 'temp'
): BusinessIdentityResult {
  const $ = cheerio.load(htmlContent);
  const evidence: LeadEvidence[] = [];
  const conflicts: LeadConflict[] = [];
  const addresses: ExtractedAddress[] = [];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Company Name Resolution
  const { name: companyName, confidence: nameConfidence, source: nameSource } = extractCleanCompanyName($, candidateCompanyName);

  evidence.push({
    lead_id: leadId,
    category: 'IDENTITY',
    claim: 'company_name_verified',
    value: companyName,
    confidence: nameConfidence,
    source_type: nameSource === 'JSON_LD' ? 'JSON_LD' : 'OFFICIAL_WEBSITE',
    evidence_text: `Extracted company name "${companyName}" from ${nameSource}`,
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // 2. Extract Addresses from JSON-LD Schema
  let schemaPhone: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const item of items) {
        if (item.telephone && !schemaPhone) {
          schemaPhone = String(item.telephone).trim();
        }

        // Schema address object
        const addr = item.address;
        if (addr) {
          if (Array.isArray(addr)) {
            addr.forEach((a) => {
              addresses.push({
                streetAddress: a.streetAddress,
                city: a.addressLocality,
                state: a.addressRegion,
                postalCode: a.postalCode,
                country: a.addressCountry,
              });
            });
          } else if (typeof addr === 'object') {
            addresses.push({
              streetAddress: addr.streetAddress,
              city: addr.addressLocality,
              state: addr.addressRegion,
              postalCode: addr.postalCode,
              country: addr.addressCountry,
            });
          }
        }
      }
    } catch {}
  });

  // 3. Fallback Address & Phone from footer text
  const footerText = $('footer, .footer, #footer, address, .contact-info').text() || '';
  if (!schemaPhone) {
    const phoneMatch = footerText.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (phoneMatch) {
      schemaPhone = phoneMatch[0].trim();
    }
  }

  // 4. Multi-location Detection
  // Check for indicators like "/locations", "/branches", or multiple schema addresses
  const hasMultipleSchemaAddresses = addresses.length > 1;
  const hasLocationLinks = $('a[href*="/location"], a[href*="/locations"], a[href*="/branches"], a[href*="/clinics"]').length > 0;
  const isMultiLocation = hasMultipleSchemaAddresses || hasLocationLinks;

  // 5. Geographic Consistency Evaluation
  const targetCityNorm = normalizeGeoString(targetLocation.city);
  const targetStateNorm = normalizeGeoString(targetLocation.state);

  let locationStatus: BusinessIdentityResult['locationStatus'] = 'UNVERIFIED';
  let locationConfidence = 50;

  if (targetCityNorm || targetStateNorm) {
    let fullLocationMatch = false;
    let cityMatchOnly = false;
    let stateConflictDetected = false;
    const detectedCities: string[] = [];
    const detectedStates: string[] = [];

    for (const addr of addresses) {
      const cityNorm = normalizeGeoString(addr.city);
      const stateNorm = normalizeGeoString(addr.state);
      if (addr.city) detectedCities.push(addr.city);
      if (addr.state) detectedStates.push(addr.state);

      const cityMatches = targetCityNorm ? cityNorm === targetCityNorm : true;
      const stateMatches = targetStateNorm ? stateNorm === targetStateNorm : true;

      if (cityMatches && stateMatches) {
        fullLocationMatch = true;
      } else if (cityMatches && targetStateNorm && stateNorm && stateNorm !== targetStateNorm) {
        stateConflictDetected = true;
      }
    }

    // Fallback: check footer text if schema was empty
    if (!fullLocationMatch && addresses.length === 0) {
      const cityInFooter = targetCityNorm && footerText.toLowerCase().includes(targetLocation.city?.toLowerCase() || '');
      const stateInFooter = targetStateNorm && footerText.toLowerCase().includes(targetLocation.state?.toLowerCase() || '');
      if (cityInFooter && stateInFooter) {
        fullLocationMatch = true;
      }
    }

    if (fullLocationMatch) {
      locationStatus = 'MATCHED';
      locationConfidence = 95;
      evidence.push({
        lead_id: leadId,
        category: 'LOCATION',
        claim: 'location_verified',
        value: { city: targetLocation.city, state: targetLocation.state },
        confidence: 95,
        source_type: 'JSON_LD',
        evidence_text: `Verified address location matching target city and state: ${targetLocation.city}, ${targetLocation.state || ''}`,
        freshness_status: 'FRESH',
        expires_at: expiresAt,
        verification_version: 'v1.0.0',
        verified_at: now,
      });
    } else if (isMultiLocation) {
      // Soft handling: business has multiple branches
      locationStatus = 'MULTI_LOCATION_MATCH';
      locationConfidence = 85;
      evidence.push({
        lead_id: leadId,
        category: 'LOCATION',
        claim: 'multi_location_detected',
        value: { detected_cities: detectedCities, target: targetLocation },
        confidence: 85,
        source_type: 'OFFICIAL_WEBSITE',
        evidence_text: `Multi-location practice detected. Branches found: ${detectedCities.slice(0, 3).join(', ')}`,
        freshness_status: 'FRESH',
        expires_at: expiresAt,
        verification_version: 'v1.0.0',
        verified_at: now,
      });
    } else if (stateConflictDetected || (detectedCities.length > 0 && !fullLocationMatch)) {
      // Genuine Conflict: Business explicitly says Thornton Ontario, but campaign target was Thornton Colorado
      locationStatus = 'LOCATION_MISMATCH';
      locationConfidence = 25;

      const detectedLocationStr = addresses.map((a) => `${a.city || ''}, ${a.state || ''} ${a.country || ''}`).filter(Boolean).join('; ') || detectedCities.join(', ');

      conflicts.push({
        lead_id: leadId,
        conflict_type: 'LOCATION_MISMATCH',
        severity: 'HIGH',
        values: [
          `Target: ${targetLocation.city || ''}, ${targetLocation.state || ''}`,
          `Website Address: ${detectedLocationStr}`
        ],
        sources: ['Campaign Target Location', 'Website Schema/Footer'],
        resolved: false,
        resolution_notes: `Geographic conflict detected between campaign target (${targetLocation.city}, ${targetLocation.state}) and actual website address (${detectedLocationStr})`,
      });
    }
  }

  // 6. Social URLs Cleaning
  const cleanedInstagramUrl = cleanInstagramUrl(rawInstagramUrl);
  const cleanedLinkedinUrl = cleanLinkedinUrl(rawLinkedinUrl);

  if (cleanedInstagramUrl) {
    evidence.push({
      lead_id: leadId,
      category: 'SOCIAL',
      claim: 'instagram_profile_verified',
      value: cleanedInstagramUrl,
      confidence: 95,
      source_type: 'OFFICIAL_WEBSITE',
      evidence_text: `Cleaned Instagram profile URL: ${cleanedInstagramUrl}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  }

  if (cleanedLinkedinUrl) {
    evidence.push({
      lead_id: leadId,
      category: 'SOCIAL',
      claim: 'linkedin_profile_verified',
      value: cleanedLinkedinUrl,
      confidence: 95,
      source_type: 'OFFICIAL_WEBSITE',
      evidence_text: `Cleaned LinkedIn profile URL: ${cleanedLinkedinUrl}`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });
  }

  // Calculate Identity Score (0 - 100)
  let identityScore = Math.round((nameConfidence * 0.4) + (locationConfidence * 0.4) + (schemaPhone ? 20 : 0));
  if (locationStatus === 'LOCATION_MISMATCH') {
    identityScore = Math.min(identityScore, 45); // Cap if there is an unresolved location conflict
  }

  return {
    companyName,
    companyNameConfidence: nameConfidence,
    phone: schemaPhone,
    addresses,
    isMultiLocation,
    locationStatus,
    identityScore,
    cleanedInstagramUrl,
    cleanedLinkedinUrl,
    conflicts,
    evidence,
  };
}
