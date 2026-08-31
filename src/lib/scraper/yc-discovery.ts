import { supabaseAdmin } from '@/lib/supabase/admin';
import { DiscoveredStartupLead } from './hn-discovery';

/**
 * Scrapes Y Combinator Directory Data for recently funded early-stage startups ($0 cost).
 */
export async function discoverYCLeads(
  targetBatch: string = 'W24',
  limit: number = 20
): Promise<DiscoveredStartupLead[]> {
  const ycDataEndpoints = [
    'https://raw.githubusercontent.com/matthewhefferon/yc-directory-data/main/data/companies.json',
    'https://raw.githubusercontent.com/subhash/yc-companies/main/data/companies.json'
  ];

  // Fetch existing startup leads to avoid duplicate URLs
  const { data: existingLeads } = await supabaseAdmin
    .from('startup_leads')
    .select('website_url');

  const existingDomains = new Set(
    existingLeads?.map(l => {
      try {
        const parsed = new URL(l.website_url.startsWith('http') ? l.website_url : `https://${l.website_url}`);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return l.website_url;
      }
    }) || []
  );

  let rawCompanies: any[] = [];

  for (const endpoint of ycDataEndpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        rawCompanies = await res.json();
        if (Array.isArray(rawCompanies) && rawCompanies.length > 0) {
          console.log(`[YC Discovery Engine] Successfully loaded ${rawCompanies.length} companies from YC dataset.`);
          break;
        }
      }
    } catch (err) {
      console.warn(`[YC Discovery Engine] Failed to fetch YC dataset from ${endpoint}:`, err);
    }
  }

  if (rawCompanies.length === 0) {
    console.warn('[YC Discovery Engine] No companies returned from YC dataset endpoints.');
    return [];
  }

  const discoveredLeads: DiscoveredStartupLead[] = [];
  const seenDomains = new Set<string>();

  // Filter for matching batch and small early-stage teams
  const filtered = rawCompanies.filter((c: any) => {
    const batchMatch = c.batch === targetBatch || c.batch_name === targetBatch || !targetBatch;
    const teamSize = parseInt(c.team_size || c.teamSize || '1', 10);
    const isSmallTeam = isNaN(teamSize) || teamSize <= 10;
    return batchMatch && isSmallTeam;
  });

  for (const company of filtered) {
    if (discoveredLeads.length >= limit) break;

    const rawUrl = company.website || company.url || company.website_url;
    if (!rawUrl) continue;

    let cleanHost = '';
    try {
      const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      cleanHost = parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      continue;
    }

    if (seenDomains.has(cleanHost) || existingDomains.has(cleanHost)) {
      continue;
    }

    seenDomains.add(cleanHost);

    const companyName = company.name || company.company_name || cleanHost.split('.')[0].toUpperCase();
    const description = company.one_liner || company.short_description || company.long_description || 'YC Funded Startup';
    const founderName = Array.isArray(company.founders)
      ? company.founders.map((f: any) => typeof f === 'string' ? f : f.name).join(', ')
      : company.founder_names || undefined;

    const batchName = company.batch || company.batch_name || targetBatch;

    discoveredLeads.push({
      companyName,
      websiteUrl: `https://${cleanHost}`,
      founderName,
      intentSnippet: description.slice(0, 500),
      sourceType: 'YC_FUNDED',
      ycBatch: batchName,
      techStack: Array.isArray(company.tags) ? company.tags : ['YC Funded', 'Early Stage']
    });
  }

  console.log(`[YC Discovery Engine] Discovered ${discoveredLeads.length} YC leads for batch ${targetBatch}.`);
  return discoveredLeads;
}
