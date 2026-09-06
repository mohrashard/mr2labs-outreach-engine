// ==============================================================================
// MR² LABS OUTREACH ENGINE — CMS NPPES NPI REGISTRY CLIENT (v1.0.0)
// 100% Free US Federal Open Data API (Zero Cost / No API Key Required)
// ==============================================================================

export interface NpiRegistryResult {
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  confidence: number;
  npiNumber?: string;
  source: 'NPI_REGISTRY';
  evidenceText: string;
}

/**
 * Normalizes healthcare company names for NPI matching by stripping legal suffixes.
 */
function cleanOrganizationNameForNpi(companyName: string): string {
  return companyName
    .replace(/\b(llc|inc|pc|pllc|ltd|co|corp|corporation)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Queries the US Federal CMS NPPES NPI Registry for clinic / practice authorized officials.
 */
export async function lookupNpiRegistry(
  companyName: string,
  state?: string | null,
  city?: string | null
): Promise<NpiRegistryResult | null> {
  if (!companyName || companyName.trim().length < 3) return null;

  const cleanName = cleanOrganizationNameForNpi(companyName);
  if (!cleanName || cleanName.length < 3) return null;

  try {
    let url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&organization_name=${encodeURIComponent(cleanName)}&limit=3`;
    if (state && state.length === 2) {
      url += `&state=${encodeURIComponent(state.toUpperCase())}`;
    }
    if (city && city.trim().length > 2) {
      url += `&city=${encodeURIComponent(city.trim())}`;
    }

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MR2Labs/1.0',
      },
      signal: AbortSignal.timeout(4000), // Strict 4s timeout
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      // If city search was too specific, retry with just state
      if (city && state) {
        return lookupNpiRegistry(companyName, state, null);
      }
      return null;
    }

    for (const result of data.results) {
      const basic = result.basic || {};
      const auth = result.authorized_official || {};

      const firstName = auth.first_name || basic.authorized_official_first_name || null;
      const lastName = auth.last_name || basic.authorized_official_last_name || null;
      const title = auth.title || basic.authorized_official_title_or_position || auth.telephone_number_title || 'Authorized Official';

      if (firstName && lastName) {
        const cleanFirst = firstName.trim();
        const cleanLast = lastName.trim();
        const fullName = `${cleanFirst} ${cleanLast}`;
        const cleanTitle = title.trim().toUpperCase();

        let confidence = 85;
        // Higher confidence if explicit owner / medical director title
        if (/owner|president|ceo|founder|director|physician|principal/i.test(cleanTitle)) {
          confidence = 95;
        }

        return {
          name: fullName,
          firstName: cleanFirst,
          lastName: cleanLast,
          role: cleanTitle || 'OWNER',
          confidence,
          npiNumber: result.number ? String(result.number) : undefined,
          source: 'NPI_REGISTRY',
          evidenceText: `Verified US CMS NPI registry official: ${fullName} (${cleanTitle}) for NPI #${result.number || 'N/A'}`,
        };
      }
    }
  } catch (err: any) {
    // Graceful fallback on network timeout
    console.warn('[NPI Registry Warning]:', err?.message || err);
  }

  return null;
}
