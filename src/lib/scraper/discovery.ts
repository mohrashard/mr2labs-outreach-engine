import { supabaseAdmin } from '@/lib/supabase/admin';

export interface DiscoveredLead {
  companyName: string;
  websiteUrl: string;
  snippet: string;
}

const BLACKLISTED_DOMAINS = [
  // Aggregators & Directories
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com', 'yelp.com',
  'facebook.com', 'instagram.com', 'linkedin.com', 'homes.com', 'loopnet.com',
  'clutch.co', 'expertise.com', 'designrush.com', 'upwork.com', 'fiverr.com',
  'thumbtack.com', 'yellowpages.com', 'g2.com', 'capterra.com', 'bark.com',
  'builtin.com', 'digitalagencynetwork.com', 'itprofiles.com', '50pros.com',
  'themanifest.com', 'upcity.com', 'goodfirms.co', 'sortlist.com',
  'wikipedia.org', 'mapquest.com', 'bairesdev.com',

  // Global Franchises & Mega-Brokerages (Unpitchable corporate IT lock-ins)
  'compass.com', 'century21.com', 'remax.com', 'kw.com', 'exprealty.com',
  'coldwellbanker.com', 'theagencyre.com', 'serhant.com', 'avisonyoung.com',
  'avisonyoung.us', 'berkshirehathawayhs.com', 'bhhs.com', 'sothebysrealty.com',
  'cbre.com', 'jll.com', 'cushmanwakefield.com',

  // Trade Associations, Boards & Non-Profits
  'miamirealtors.com', 'nar.realtor', 'floridarealtors.org', 'realtor.org',

  // National Media, Ranking & Publishing Sites
  'usnews.com', 'realtrends.com', 'forbes.com', 'inc.com', 'entrepreneur.com',
  'bloomberg.com', 'businessinsider.com', 'nytimes.com', 'wsj.com',

  // Social & Forums
  'reddit.com', 'quora.com', 'pinterest.com', 'medium.com', 'twitter.com', 'tiktok.com', 'x.com',
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

// --- DYNAMIC INDUSTRY DORK PROFILES ---
export interface DorkProfile {
  queryTemplate: (niche: string, location: string) => string;
  negativeKeywords: string[];
}

function getDorkProfile(niche: string, context: string): DorkProfile {
  const normalizedNiche = niche.toLowerCase();
  const normalizedContext = context.toLowerCase();

  // 1. Real Estate Profile (HARDENED)
  if (normalizedNiche.includes('real estate') || normalizedNiche.includes('realty')) {
    return {
      queryTemplate: (n, l) => `(realtor OR broker OR "real estate agency") ${l} -intitle:software -intitle:marketing -site:ziprecruiter.com -site:indeed.com -site:clutch.co`,
      negativeKeywords: [
        'software development', 'crm', 'saas', 'outsourcing', 'white label', 
        'marketing agency', 'digital agency', 'consulting', 'dev shop', 'cloud services'
      ]
    };
  }

  // 2. Dynamic Template-Aware Profile
  const isWhiteLabel = normalizedNiche.includes('white label') || normalizedContext.includes('agency');
  const intentDork = isWhiteLabel 
    ? `("${niche}" OR "agency partnership" OR "white label development")`
    : `("${niche}" OR "custom software" OR "client portal") -inurl:directory`;

  return {
    queryTemplate: (n, l) => `${intentDork} ${l} -intitle:list -intitle:top -intitle:best -site:zillow.com -site:yelp.com -site:clutch.co`,
    negativeKeywords: ['directory', 'top 10', 'best of', 'jobs', 'hiring', 'clutch', 'upcity']
  };
}
// ----------------------------------------

export async function discoverTargetDomains(
  niche: string,
  location: string,
  page: number = 1,
  mode: 'legacy' | 'diy' = 'legacy'
): Promise<DiscoveredLead[]> {
  // Sanitize location to fix spacing issues like "Miami , Florida" -> "Miami, Florida"
  const cleanLocation = location
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  // Fetch ALL processed domains to prevent redundant enrichment across any campaign
  const { data: existingLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('website_url');

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
        (t: Record<string, any>) =>
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
  const combinedContext = `${niche} ${painPoints} ${solution}`;
  const dorkProfile = getDorkProfile(niche, combinedContext);
  let query = dorkProfile.queryTemplate(niche, cleanLocation);
  
  // Inject DIY Trap if requested
  if (mode === 'diy') {
    query = `(site:*.wixsite.com OR site:*.carrd.co OR site:*.weebly.com OR site:*.squarespace.com OR "powered by wordpress") "${niche}" ${cleanLocation}`;
  }

  console.log(`[Discovery] Using Dork Query [${mode.toUpperCase()}]: ${query}`);

  // 1. Primary Provider: Serper.dev
  if (process.env.SERPER_API_KEY) {
    try {
      console.log(`[Discovery] Fetching Serper page ${page}...`);
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 50, page }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.organic?.length) {
          return processSerpResults(data.organic, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains);
        }
      }
    } catch (err) {
      console.warn(`[Discovery] Serper page ${page} failed, trying SerpApi fallback`, err);
    }
  }

  // 2. Secondary Provider: SerpApi
  const serpApiKey = process.env.SERP_API || process.env.SERP_API_FALLBACK;
  if (serpApiKey) {
    try {
      const start = (page - 1) * 50;
      const res = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}&num=50&start=${start}`
      );
      const data = await res.json();
      if (data.organic_results?.length) {
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains);
      }
    } catch (err) {
      console.warn('[Discovery] SerpApi failed, trying ValueSERP fallback');
    }
  }

  // 3. Tertiary Provider: ValueSERP
  const valueSerpKey = process.env.VALUE_SERP_API || process.env.VALUE_SERP_API_FALLBACK;
  if (valueSerpKey) {
    try {
      const start = (page - 1) * 50;
      const res = await fetch(
        `https://api.valueserp.com/search?api_key=${valueSerpKey}&q=${encodeURIComponent(query)}&num=50&page=${page}`
      );
      const data = await res.json();
      if (data.organic_results?.length) {
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains);
      }
    } catch (err) {
      console.error('[Discovery] ValueSERP failed:', err);
    }
  }

  return [];
}

function processSerpResults(
  results: Record<string, any>[],
  titleKey: string,
  linkKey: string,
  snippetKey: string,
  negativeKeywords: string[],
  existingDomains?: Set<string>
): DiscoveredLead[] {
  const leads: DiscoveredLead[] = [];
  const seenDomains = new Set<string>();

  // Dynamic Listicle/Aggregator Heuristic Regex
  // Catches: "Top 10", "15 Best", "Directory", "Clutch", "Yelp", "UpCity"
  const listicleRegex = /\b(top|best)\s+\d+\b|\b\d+\s+(top|best)\b|\bcomplete\s+directory\b|\bclutch\b|\byelp\b|\bupcity\b/i;

  for (const item of results) {
    const title = (item[titleKey] || '').toString();
    const snippet = (item[snippetKey] || '').toString();

    // 1. Drop if the Google Title implies an aggregator or listicle
    if (listicleRegex.test(title)) {
      continue;
    }

    // 2. Strict Domain Title Filtering based on DorkProfile negative keywords
    const lowerTitle = title.toLowerCase();
    const containsNoise = negativeKeywords.some((keyword) => lowerTitle.includes(keyword.toLowerCase()));
    
    if (containsNoise) {
      console.log(`[Discovery] Dropping noisy domain (matched negative keyword): ${title}`);
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
      snippet: snippet,
    });
  }

  return leads;
}
