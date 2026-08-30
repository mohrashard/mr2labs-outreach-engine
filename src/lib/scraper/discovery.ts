import { supabaseAdmin } from '@/lib/supabase/admin';
import OpenAI from 'openai';

export interface DiscoveredLead {
  companyName: string;
  websiteUrl: string;
  snippet: string;
  siteType?: 'DIY' | 'LEGACY';
}

export const BLACKLISTED_DOMAINS = [
  // Search Engines, Tech Giants & Social
  'google.com', 'google.co.in', 'google.com.au', 'google.co.uk', 'google.ca',
  'bing.com', 'yahoo.com', 'apple.com', 'microsoft.com', 'indeed.com', 'glassdoor.com',
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  'reddit.com', 'quora.com', 'pinterest.com', 'medium.com', 'tiktok.com',

  // Aggregators, Directories, Major Franchises & Review Sites
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com', 'yelp.com', 'homes.com', 'loopnet.com',
  'clutch.co', 'expertise.com', 'designrush.com', 'upwork.com', 'fiverr.com',
  'thumbtack.com', 'yellowpages.com', 'yellow-pages.us.com', 'yellowpages.com.au', 'yellowpages.ca',
  'g2.com', 'capterra.com', 'bark.com', 'builtin.com', 'digitalagencynetwork.com', 'itprofiles.com', 
  '50pros.com', 'themanifest.com', 'upcity.com', 'goodfirms.co', 'sortlist.com',
  'wikipedia.org', 'mapquest.com', 'bairesdev.com', 'clearlyrated.com', 'trustpilot.com', 'sitejabber.com',
  'har.com', 'fastexpert.com', 'sitebuilderreport.com', 'apartmentguide.com', 'rent.com', 'apartments.com',
  'compass.com', 'coldwellbanker.com', 'century21.com', 'remax.com', 'kw.com',

  // News, Publishing & Media Outlets
  'usnews.com', 'realtrends.com', 'forbes.com', 'inc.com', 'entrepreneur.com',
  'bloomberg.com', 'businessinsider.com', 'nytimes.com', 'wsj.com', 'nypost.com',
  'variety.com', 'pottsmerc.com', 'travelvoice.jp', 'gbdmagazine.com', 'huffpost.com',
];

export const ROOT_PLATFORM_DOMAINS = new Set([
  'wix.com', 'squarespace.com', 'wordpress.com', 'webflow.com', 'shopify.com',
  'hubspot.com', 'carrd.co', 'framer.app', 'weebly.com', 'godaddy.com', 'namecheap.com'
]);

function cleanDomainUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    const hostname = parsed.hostname.toLowerCase();
    const cleanHost = hostname.replace(/^www\./, '');

    // Block exact root platform marketing pages (e.g. wix.com or www.wix.com) but ALLOW client subdomains (e.g. client.wixsite.com or client.webflow.io)
    if (ROOT_PLATFORM_DOMAINS.has(cleanHost)) {
      return null;
    }

    // Block explicitly blacklisted aggregator/social/news domains or non-commercial .org / .gov / .edu sites
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

function sanitizeQueryForSerper(query: string): string {
  return query
    .replace(/-site:[^\s]+/g, '')
    .replace(/-inurl:[^\s]+/g, '')
    .replace(/intitle:[^\s]+/g, '')
    .replace(/inurl:[^\s]+/g, '')
    .replace(/["()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- DYNAMIC INDUSTRY DORK PROFILES ---
export interface DorkProfile {
  queryTemplate: (niche: string, location: string) => string;
  negativeKeywords: string[];
}

const dorkQueryCache = new Map<string, DorkProfile>();

// 24-Hour SERP API Response Memory Cache
interface SerpCacheEntry {
  organic: any[];
  timestamp: number;
}
const serpResultMemoryCache = new Map<string, SerpCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

function singularizeNiche(nicheStr: string): string {
  let cleaned = nicheStr.trim();
  if (/agencies$/i.test(cleaned)) return cleaned.replace(/agencies$/i, 'Agency');
  if (/companies$/i.test(cleaned)) return cleaned.replace(/companies$/i, 'Company');
  if (/brokers$/i.test(cleaned)) return cleaned.replace(/brokers$/i, 'Broker');
  if (/brokerages$/i.test(cleaned)) return cleaned.replace(/brokerages$/i, 'Brokerage');
  if (/firms$/i.test(cleaned)) return cleaned.replace(/firms$/i, 'Firm');
  if (/services$/i.test(cleaned)) return cleaned.replace(/services$/i, 'Service');
  if (/specialists$/i.test(cleaned)) return cleaned.replace(/specialists$/i, 'Specialist');
  if (/consultants$/i.test(cleaned)) return cleaned.replace(/consultants$/i, 'Consultant');
  if (/lawyers$/i.test(cleaned)) return cleaned.replace(/lawyers$/i, 'Lawyer');
  if (/attorneys$/i.test(cleaned)) return cleaned.replace(/attorneys$/i, 'Attorney');
  if (/contractors$/i.test(cleaned)) return cleaned.replace(/contractors$/i, 'Contractor');
  
  if (/s$/i.test(cleaned) && !/ss$/i.test(cleaned)) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
}

const inMemoryBatchSeenDomains = new Set<string>();

async function generateDorkQueryFromLLM(
  niche: string,
  painPoints: string,
  solution: string,
  location: string
): Promise<DorkProfile> {
  const systemPrompt = `You are an elite B2B OSINT and SERP search engineer.
Your task is to generate a high-precision Google search query that finds independent, owner-operated business websites for a specific niche and location.

Rules:
1. Target ONLY local independent businesses (avoid franchises, directories, aggregators, or SaaS tools).
2. Use native operational terms for this specific industry (e.g., for Real Estate use "brokerage", "principal broker", "our agents"; for Medical use "practice", "clinic", "our doctors"; for Legal use "attorney", "partners").
3. NEVER use developer words like "portfolio", "website", or "small business".
4. Ensure grammatical natural phrasing (e.g. "boutique real estate firm", not "real estate agencies firm").
5. Return JSON ONLY:
{
  "query": "clean search phrase under 80 characters",
  "negative_keywords": ["directory", "top 10", "best of", "jobs", "clutch", "yelp"]
}`;

  const userPrompt = `Generate a Google search query for this ICP:

Niche: ${niche}
Location: ${location}
Pain Points (what they struggle with): ${painPoints}
Our Solution (what we sell): ${solution}

The query should find local businesses in ${location} that match this niche.`;

  const fallbackProfile: DorkProfile = {
    queryTemplate: (n, l) => `${singularizeNiche(n)} boutique ${l}`,
    negativeKeywords: ['directory', 'top 10', 'best of', 'jobs', 'hiring', 'clutch', 'yelp']
  };

  // Try Groq first, then cascade through your existing LLM waterfall
  const providers = [
    { key: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
    { key: process.env.GEMINI_API_KEY, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.7-flash' },
    { key: process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    { key: process.env.MISTRAL_API_KEY, baseURL: 'https://api.mistral.ai/v1', model: 'mistral-small-2506' },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const client = new OpenAI({ apiKey: provider.key, baseURL: provider.baseURL });
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) continue;

      const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim());

      if (parsed.query && typeof parsed.query === 'string') {
        const trimmedQuery = parsed.query.trim();
        
        // Reject if LLM hallucinated an empty or absurdly long query
        if (trimmedQuery.length < 5 || trimmedQuery.length > 200) {
          console.warn(`[LLM Dork Generator] Query length out of bounds (${trimmedQuery.length} chars), using fallback`);
          continue;
        }

        console.log(`[LLM Dork Generator] Generated query: ${trimmedQuery}`);
        return {
          queryTemplate: () => trimmedQuery, // location already baked in by LLM
          negativeKeywords: Array.isArray(parsed.negative_keywords) ? parsed.negative_keywords : fallbackProfile.negativeKeywords
        };
      }
    } catch (err: any) {
      console.warn(`[LLM Dork Generator] Provider failed:`, err?.message);
      continue;
    }
  }

  console.warn('[LLM Dork Generator] All providers failed. Using fallback dork profile.');
  return fallbackProfile;
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

  const cleanNiche = singularizeNiche(niche);

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
  const cacheKey = `${niche}:${cleanLocation}`;
  let dorkProfile: DorkProfile;
  let query: string;

  // High-precision industry native dork patterns
  const legacyFallbackQueries = [
    `boutique ${cleanNiche} ${cleanLocation}`,
    `independent ${cleanNiche} ${cleanLocation}`,
    `"principal broker" ${cleanNiche} ${cleanLocation}`,
    `"our agents" ${cleanNiche} ${cleanLocation}`,
    `"meet the team" ${cleanNiche} ${cleanLocation}`,
    `"featured listings" ${cleanNiche} ${cleanLocation}`,
    `local ${cleanNiche} ${cleanLocation}`,
    `${cleanNiche} group ${cleanLocation}`,
    `${cleanNiche} firm ${cleanLocation}`,
    `owner operated ${cleanNiche} ${cleanLocation}`
  ];

  const diyQueries = [
    `"contact us" ${cleanNiche} ${cleanLocation}`,
    `"our team" ${cleanNiche} ${cleanLocation}`,
    `"about us" ${cleanNiche} ${cleanLocation}`,
    `"local office" ${cleanNiche} ${cleanLocation}`,
    `"client reviews" ${cleanNiche} ${cleanLocation}`,
    `owner operated ${cleanNiche} ${cleanLocation}`,
    `custom ${cleanNiche} ${cleanLocation}`,
    `independent ${cleanNiche} ${cleanLocation}`,
    `"schedule consultation" ${cleanNiche} ${cleanLocation}`,
    `professional ${cleanNiche} ${cleanLocation}`
  ];

  let serpPage = 1;

  if (mode === 'diy') {
    const qIndex = (page - 1) % diyQueries.length;
    serpPage = Math.floor((page - 1) / diyQueries.length) + 1;
    query = diyQueries[qIndex];
    dorkProfile = { queryTemplate: () => query, negativeKeywords: ['directory', 'top 10', 'best of', 'jobs', 'hiring'] };
  } else {
    if (page === 1) {
      if (dorkQueryCache.has(cacheKey)) {
        dorkProfile = dorkQueryCache.get(cacheKey)!;
        console.log(`[LLM Dork Generator] Cache hit for "${cacheKey}"`);
      } else {
        dorkProfile = await generateDorkQueryFromLLM(niche, painPoints, solution, cleanLocation);
        dorkQueryCache.set(cacheKey, dorkProfile);
      }
      query = dorkProfile.queryTemplate(niche, cleanLocation);
      serpPage = 1;
    } else {
      const qIndex = (page - 2) % legacyFallbackQueries.length;
      serpPage = Math.floor((page - 2) / legacyFallbackQueries.length) + 1;
      query = legacyFallbackQueries[qIndex];
      dorkProfile = { queryTemplate: () => query, negativeKeywords: ['directory', 'top 10', 'best of', 'jobs', 'hiring'] };
    }
  }

  console.log(`[Discovery] Using Dork Query [${mode.toUpperCase()}]: ${query}`);

  try {
    await supabaseAdmin.from('system_logs').insert({
      event_type: 'DORK_GENERATED',
      message: `🤖 [AI DORK - ${mode.toUpperCase()}] Executing SERP Query: ${query}`,
      metadata: { query, mode, niche, location: cleanLocation, page }
    });
  } catch (e) {
    // Non-blocking log insert
  }

  // 0. Check 24-Hour SERP Cache to save API credits
  const serpCacheKey = `${query.toLowerCase().trim()}:${serpPage}:${cleanLocation.toLowerCase()}`;
  if (serpResultMemoryCache.has(serpCacheKey)) {
    const entry = serpResultMemoryCache.get(serpCacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      console.log(`[Discovery SERP Cache] ⚡ Hit cached organic SERP results for "${query}" (0 API credits used)`);
      const leads = processSerpResults(entry.organic, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
      if (leads.length > 0) return leads;
    }
  }

  // Helper to parse comma-separated keys and deduplicate
  const parseKeys = (envVal?: string) => (envVal || '').split(',').map(k => k.trim()).filter(Boolean);

  const serperKeys = Array.from(new Set([
    ...parseKeys(process.env.SERPER_API_KEY),
    ...parseKeys(process.env.SERPER_API_KEYS)
  ]));

  const serpApiKeys = Array.from(new Set([
    ...parseKeys(process.env.SERP_API),
    ...parseKeys(process.env.SERP_API_FALLBACK),
    ...parseKeys(process.env.SERPAPI_API_KEY)
  ]));

  const valueSerpKeys = Array.from(new Set([
    ...parseKeys(process.env.VALUE_SERP_API),
    ...parseKeys(process.env.VALUE_SERP_API_FALLBACK)
  ]));

  const firecrawlKeys = Array.from(new Set([
    ...parseKeys(process.env.FIRECRAWL_API)
  ]));

  const scraperApiKeys = Array.from(new Set([
    ...parseKeys(process.env.SCRAPER_API)
  ]));

  // 1. Primary Provider Pool: Serper.dev
  for (const apiKey of serperKeys) {
    try {
      console.log(`[Discovery] Fetching Serper (key: ${apiKey.slice(0, 6)}...) dork page ${page} (serpPage ${serpPage})...`);
      let activeQuery = query;
      let res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: activeQuery, num: 50, page: serpPage }),
      });

      // Handle Serper Free Tier 400 Bad Request pattern restrictions
      if (res.status === 400) {
        const cleanQ = sanitizeQueryForSerper(activeQuery);
        console.warn(`[Discovery] Serper returned 400 for query pattern. Retrying with sanitized query: "${cleanQ}"`);
        res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: cleanQ, num: 50, page: serpPage }),
        });
      }
      
      if (res.ok) {
        const data = await res.json();
        if (data.organic?.length) {
          serpResultMemoryCache.set(serpCacheKey, { organic: data.organic, timestamp: Date.now() });
          const leads = processSerpResults(data.organic, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
          if (leads.length > 0) return leads;
        }
      } else {
        const errText = await res.text();
        console.warn(`[Discovery] Serper key (${apiKey.slice(0, 6)}...) non-ok response (${res.status}): ${errText}. Cascading...`);
      }
    } catch (err) {
      console.warn(`[Discovery] Serper key (${apiKey.slice(0, 6)}...) error, cascading to next key/provider...`, err);
    }
  }

  // 2. Secondary Provider Pool: SerpApi
  for (const apiKey of serpApiKeys) {
    try {
      console.log(`[Discovery] Fetching SerpApi (key: ${apiKey.slice(0, 6)}...) dork page ${page} (serpPage ${serpPage})...`);
      const start = (serpPage - 1) * 50;
      const res = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=50&start=${start}&engine=google`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          console.warn(`[Discovery] SerpApi key (${apiKey.slice(0, 6)}...) account error: ${data.error}. Cascading...`);
          continue;
        }
        if (data.organic_results?.length) {
          serpResultMemoryCache.set(serpCacheKey, { organic: data.organic_results, timestamp: Date.now() });
          const leads = processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
          if (leads.length > 0) return leads;
        }
      } else {
        console.warn(`[Discovery] SerpApi key (${apiKey.slice(0, 6)}...) non-ok response (${res.status}). Cascading...`);
      }
    } catch (err) {
      console.warn(`[Discovery] SerpApi key (${apiKey.slice(0, 6)}...) error, cascading...`, err);
    }
  }

  // 3. Tertiary Provider Pool: ValueSERP
  for (const apiKey of valueSerpKeys) {
    try {
      console.log(`[Discovery] Fetching ValueSERP (key: ${apiKey.slice(0, 6)}...) dork page ${page} (serpPage ${serpPage})...`);
      const res = await fetch(
        `https://api.valueserp.com/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&num=50&page=${serpPage}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.request_info?.success === false) {
          console.warn(`[Discovery] ValueSERP key (${apiKey.slice(0, 6)}...) account error: ${data.request_info?.message || 'Failed'}. Cascading...`);
          continue;
        }
        if (data.organic_results?.length) {
          serpResultMemoryCache.set(serpCacheKey, { organic: data.organic_results, timestamp: Date.now() });
          const leads = processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
          if (leads.length > 0) return leads;
        }
      } else {
        console.warn(`[Discovery] ValueSERP key (${apiKey.slice(0, 6)}...) non-ok response (${res.status}). Cascading...`);
      }
    } catch (err) {
      console.error(`[Discovery] ValueSERP key (${apiKey.slice(0, 6)}...) error:`, err);
    }
  }

  // 4. Quaternary Provider Pool: Firecrawl API (Search Endpoint)
  for (const apiKey of firecrawlKeys) {
    try {
      console.log(`[Discovery] Fetching Firecrawl Search (key: ${apiKey.slice(0, 6)}...) dork page ${page} (serpPage ${serpPage})...`);
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ query: query, page: serpPage })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.length) {
          // Firecrawl returns an array of { url, title, description }
          const mappedResults = data.data.map((r: any) => ({
            title: r.title,
            link: r.url,
            snippet: r.description
          }));
          serpResultMemoryCache.set(serpCacheKey, { organic: mappedResults, timestamp: Date.now() });
          const leads = processSerpResults(mappedResults, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
          if (leads.length > 0) return leads;
        }
      } else {
        console.warn(`[Discovery] Firecrawl key (${apiKey.slice(0, 6)}...) non-ok response (${res.status}). Cascading...`);
      }
    } catch (err) {
      console.warn(`[Discovery] Firecrawl key (${apiKey.slice(0, 6)}...) error, cascading...`, err);
    }
  }

  // 5. Quinary Provider Pool: ScraperAPI Structured Google Search
  for (const apiKey of scraperApiKeys) {
    try {
      console.log(`[Discovery] Fetching ScraperAPI Search (key: ${apiKey.slice(0, 6)}...) dork page ${page} (serpPage ${serpPage})...`);
      const start = (serpPage - 1) * 50;
      const res = await fetch(
        `http://api.scraperapi.com/structured/google/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&num=50&start=${start}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.organic_results?.length) {
          serpResultMemoryCache.set(serpCacheKey, { organic: data.organic_results, timestamp: Date.now() });
          const leads = processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
          if (leads.length > 0) return leads;
        }
      } else {
        console.warn(`[Discovery] ScraperAPI key (${apiKey.slice(0, 6)}...) non-ok response (${res.status}). Cascading...`);
      }
    } catch (err) {
      console.warn(`[Discovery] ScraperAPI key (${apiKey.slice(0, 6)}...) error, cascading...`, err);
    }
  }

  console.warn('[Discovery] All SERP providers and keys exhausted or returned 0 leads.');
  return [];
}

function processSerpResults(
  results: Record<string, any>[],
  titleKey: string,
  linkKey: string,
  snippetKey: string,
  negativeKeywords: string[],
  existingDomains?: Set<string>,
  mode: 'legacy' | 'diy' = 'legacy'
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

    if (inMemoryBatchSeenDomains.size > 5000) {
      inMemoryBatchSeenDomains.clear();
    }

    const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '').toLowerCase();
    if (seenDomains.has(hostname)) continue;
    if (existingDomains?.has(hostname)) {
      console.log(`[Discovery] Skipping duplicate domain: ${hostname}`);
      continue;
    }
    if (inMemoryBatchSeenDomains.has(hostname)) {
      console.log(`[Discovery Batch Deduplication] Skipping duplicate domain in current pipeline batch: ${hostname}`);
      continue;
    }

    seenDomains.add(hostname);
    inMemoryBatchSeenDomains.add(hostname);
    leads.push({
      companyName: title || hostname,
      websiteUrl: cleanUrl,
      snippet: snippet,
      siteType: mode === 'diy' ? 'DIY' : 'LEGACY'
    });
  }

  return leads;
}
