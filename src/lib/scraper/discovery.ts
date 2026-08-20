import { supabaseAdmin } from '@/lib/supabase/admin';

export interface DiscoveredLead {
  companyName: string;
  websiteUrl: string;
  snippet: string;
}

const BLACKLISTED_DOMAINS = [
  // Aggregators & Directories
  'zillow.com',
  'redfin.com',
  'realtor.com',
  'trulia.com',
  'yelp.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'homes.com',
  'loopnet.com',
  'clutch.co',
  'expertise.com',
  'designrush.com',
  'upwork.com',
  'fiverr.com',
  'thumbtack.com',
  'yellowpages.com',
  'g2.com',
  'capterra.com',
  'bark.com',
  'builtin.com',
  'digitalagencynetwork.com',
  'itprofiles.com',
  '50pros.com',
  'themanifest.com',
  'upcity.com',
  'goodfirms.co',
  'sortlist.com',
  'wikipedia.org',
  'mapquest.com',

  // Global Franchises & Mega-Brokerages (Unpitchable corporate IT lock-ins)
  'compass.com',
  'century21.com',
  'remax.com',
  'kw.com',
  'exprealty.com',
  'coldwellbanker.com',
  'theagencyre.com',
  'serhant.com',
  'avisonyoung.com',
  'avisonyoung.us',
  'berkshirehathawayhs.com',
  'bhhs.com',
  'sothebysrealty.com',
  'cbre.com',
  'jll.com',
  'cushmanwakefield.com',

  // Trade Associations, Boards & Non-Profits
  'miamirealtors.com',
  'nar.realtor',
  'floridarealtors.org',
  'realtor.org',

  // National Media, Ranking & Publishing Sites
  'usnews.com',
  'realtrends.com',
  'forbes.com',
  'inc.com',
  'entrepreneur.com',
  'bloomberg.com',
  'businessinsider.com',
  'nytimes.com',
  'wsj.com',
];

function cleanDomainUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    const hostname = parsed.hostname.toLowerCase();

    // Block explicitly blacklisted domains or non-commercial .org / .gov / .edu sites
    if (
      BLACKLISTED_DOMAINS.some((blocked) => hostname.includes(blocked)) ||
      hostname.endsWith('.org') ||
      hostname.endsWith('.gov') ||
      hostname.endsWith('.edu')
    ) {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
}

export async function discoverTargetDomains(
  niche: string,
  location: string
): Promise<DiscoveredLead[]> {
  // Fetch recently processed domains to prevent redundant enrichment
  const { data: existingLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('website_url')
    .order('created_at', { ascending: false })
    .limit(500);

  const existingDomains = new Set(
    existingLeads?.map(l => {
      try {
        const urlStr = l.website_url.startsWith('http') ? l.website_url : `https://${l.website_url}`;
        return new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return l.website_url;
      }
    }) || []
  );

  // 1. Fetch template parameters live from Supabase database
  let painPoints = '';
  let solution = '';

  try {
    const { data: templates } = await supabaseAdmin
      .from('pitch_templates')
      .select('*');
    
    if (templates && templates.length > 0) {
      const match = templates.find(
        (t: any) =>
          t.niche_name.toLowerCase() === niche.toLowerCase() ||
          t.niche_name.toLowerCase().includes(niche.toLowerCase()) ||
          niche.toLowerCase().includes(t.niche_name.toLowerCase())
      );
      if (match) {
        painPoints = match.pain_points || '';
        solution = match.mr2_solution || '';
        console.log(`[Discovery Dork Engine] Loaded live Supabase template for "${match.niche_name}"`);
      }
    }
  } catch (err) {
    console.warn('[Discovery Dork Engine] Supabase pitch_templates fetch warning:', err);
  }

  // DYNAMIC DORK BUILDER: Adapt search query intent based on live Database Template & Niche
  const combinedContext = `${niche} ${painPoints} ${solution}`.toLowerCase();
  
  const isWhiteLabel = combinedContext.includes('white label') || 
                       combinedContext.includes('agency') ||
                       combinedContext.includes('partnership') ||
                       combinedContext.includes('outsourc');

  let intentDork: string;
  if (isWhiteLabel) {
    intentDork = `"${niche}" OR "agency partnership" OR "white label development" in ${location}`;
  } else {
    intentDork = `"${niche}" OR "custom software" OR "client portal" in ${location} -inurl:directory`;
  }

  const query = `${intentDork} -intitle:list -intitle:top -intitle:best -site:zillow.com -site:yelp.com`;

  // 1. Primary Provider: Serper.dev
  if (process.env.SERPER_API_KEY) {
    try {
      const searchQueries = [
        { q: query, num: 50, page: 1 },
        { q: query, num: 50, page: 2 },
        { q: query, num: 50, page: 3 },
        { q: query, num: 50, page: 4 },
        { q: query, num: 50, page: 5 },
      ];
      const allOrganic: any[] = [];
      for (const params of searchQueries) {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': process.env.SERPER_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (data.organic?.length) {
          allOrganic.push(...data.organic);
        }
      }

      if (allOrganic.length > 0) {
        return processSerpResults(allOrganic, 'title', 'link', 'snippet', existingDomains);
      }
    } catch (err) {
      console.warn('[Discovery] Serper failed, trying SerpApi fallback');
    }
  }

  // 2. Secondary Provider: SerpApi
  const serpApiKey = process.env.SERP_API || process.env.SERP_API_FALLBACK;
  if (serpApiKey) {
    try {
      const res = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}`
      );
      const data = await res.json();
      if (data.organic_results?.length) {
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', existingDomains);
      }
    } catch (err) {
      console.warn('[Discovery] SerpApi failed, trying ValueSERP fallback');
    }
  }

  // 3. Tertiary Provider: ValueSERP
  const valueSerpKey = process.env.VALUE_SERP_API || process.env.VALUE_SERP_API_FALLBACK;
  if (valueSerpKey) {
    try {
      const res = await fetch(
        `https://api.valueserp.com/search?api_key=${valueSerpKey}&q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data.organic_results?.length) {
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', existingDomains);
      }
    } catch (err) {
      console.error('[Discovery] ValueSERP failed:', err);
    }
  }

  return [];
}

function processSerpResults(
  results: any[],
  titleKey: string,
  linkKey: string,
  snippetKey: string,
  existingDomains?: Set<string>
): DiscoveredLead[] {
  const leads: DiscoveredLead[] = [];
  const seenDomains = new Set<string>();

  // Dynamic Listicle/Aggregator Heuristic Regex
  // Catches: "Top 10", "15 Best", "Guide to", "Directory", "Clutch", "Yelp", "UpCity"
  const listicleRegex = /\b(top|best)\s+\d+\b|\b\d+\s+(top|best)\b|\bguide\b|\bdirectory\b|\bclutch\b|\byelp\b|\bupcity\b/i;

  for (const item of results) {
    const title = item[titleKey] || '';

    // 1. Drop if the Google Title implies an aggregator or listicle
    if (listicleRegex.test(title)) {
      continue;
    }

    const cleanUrl = cleanDomainUrl(item[linkKey]);
    if (!cleanUrl) continue;

    const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '').toLowerCase();
    if (seenDomains.has(hostname)) continue;
    if (existingDomains?.has(hostname)) {
      console.log(`[Discovery] Skipping duplicate domain: ${hostname}`);
      continue;
    }

    seenDomains.add(hostname);
    leads.push({
      companyName: title || hostname,
      websiteUrl: cleanUrl,
      snippet: item[snippetKey] || '',
    });
  }

  return leads;
}
