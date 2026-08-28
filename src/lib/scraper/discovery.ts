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

  // Aggregators, Directories & Review Sites
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com', 'yelp.com', 'homes.com', 'loopnet.com',
  'clutch.co', 'expertise.com', 'designrush.com', 'upwork.com', 'fiverr.com',
  'thumbtack.com', 'yellowpages.com', 'yellow-pages.us.com', 'yellowpages.com.au', 'yellowpages.ca',
  'g2.com', 'capterra.com', 'bark.com', 'builtin.com', 'digitalagencynetwork.com', 'itprofiles.com', 
  '50pros.com', 'themanifest.com', 'upcity.com', 'goodfirms.co', 'sortlist.com',
  'wikipedia.org', 'mapquest.com', 'bairesdev.com', 'clearlyrated.com', 'trustpilot.com', 'sitejabber.com',

  // News, Publishing & Media Outlets
  'usnews.com', 'realtrends.com', 'forbes.com', 'inc.com', 'entrepreneur.com',
  'bloomberg.com', 'businessinsider.com', 'nytimes.com', 'wsj.com', 'nypost.com',
  'variety.com', 'pottsmerc.com', 'travelvoice.jp', 'gbdmagazine.com', 'huffpost.com',

  // Tech Tools, CRMs & Lead Competitors
  'shaker.nyc', 'leads-extractor.com', 'godaddy.com', 'namecheap.com', 'wix.com', 'squarespace.com',
  'wordpress.com', 'shopify.com', 'hubspot.com',

  // Global Franchises & Mega-Brokerages (Unpitchable corporate IT lock-ins)
  'compass.com', 'century21.com', 'remax.com', 'kw.com', 'exprealty.com',
  'coldwellbanker.com', 'theagencyre.com', 'serhant.com', 'avisonyoung.com',
  'avisonyoung.us', 'berkshirehathawayhs.com', 'bhhs.com', 'sothebysrealty.com',
  'cbre.com', 'jll.com', 'cushmanwakefield.com',

  // Trade Associations, Boards & Non-Profits
  'miamirealtors.com', 'nar.realtor', 'floridarealtors.org', 'realtor.org',
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

const dorkQueryCache = new Map<string, DorkProfile>();

async function generateDorkQueryFromLLM(
  niche: string,
  painPoints: string,
  solution: string,
  location: string
): Promise<DorkProfile> {
  const systemPrompt = `You are a B2B lead generation expert specializing in Google search operators.
Your job is to generate a precise Google search query string to find ideal small/mid-size independent businesses that match the given ICP profile.

Rules:
- Target ONLY independent, owner-operated businesses (not franchises, not directories, not aggregators, not media sites)
- Use Google operators: intitle:, inurl:, site: exclusions, OR groups, quotes for exact phrases
- The query must surface actual company websites, not listicles or review sites
- Negative keywords must block: directories, job boards, news sites, franchises, aggregators
- Keep the query under 200 characters so Google doesn't truncate it
- Return ONLY valid JSON, no markdown, no explanation

Return format:
{
  "query": "the full google search string including location",
  "negative_keywords": ["keyword1", "keyword2"]
}`;

  const userPrompt = `Generate a Google dork query for this ICP:

Niche: ${niche}
Location: ${location}
Pain Points (what they struggle with): ${painPoints}
Our Solution (what we sell): ${solution}

The query should find businesses that HAVE these pain points — meaning they are small, independent, likely using outdated tech or manual processes.`;

  const fallbackProfile: DorkProfile = {
    queryTemplate: (n, l) => `"${n}" ${l} -site:yelp.com -site:clutch.co -intitle:"top" -intitle:"best"`,
    negativeKeywords: ['directory', 'top 10', 'best of', 'jobs', 'hiring']
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
        if (trimmedQuery.length < 10 || trimmedQuery.length > 250) {
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

  const legacyFallbackQueries = [
    `"${niche}" "${cleanLocation}" -site:zillow.com -site:realtor.com -site:redfin.com -site:yelp.com -site:linkedin.com`,
    `"${niche} agency" "${cleanLocation}" -site:zillow.com -site:realtor.com -site:yelp.com`,
    `"${niche} firm" "${cleanLocation}" -site:zillow.com -site:realtor.com -site:yelp.com`,
    `intitle:"${niche}" "${cleanLocation}" -site:zillow.com -site:realtor.com -site:yelp.com`,
    `"${niche} group" "${cleanLocation}" -site:zillow.com -site:realtor.com -site:yelp.com`
  ];

  if (mode === 'diy') {
    const diyQueries = [
      `"powered by squarespace" "${niche}" "${cleanLocation}"`,
      `"created with wix" "${niche}" "${cleanLocation}"`,
      `"powered by wordpress" "${niche}" "${cleanLocation}"`,
      `"built with webflow" "${niche}" "${cleanLocation}"`,
      `("wixsite.com" OR "framer.app" OR "squarespace") "${niche}" "${cleanLocation}"`
    ];
    query = diyQueries[(page - 1) % diyQueries.length];
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
    } else {
      query = legacyFallbackQueries[(page - 1) % legacyFallbackQueries.length];
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
          return processSerpResults(data.organic, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
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
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
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
        return processSerpResults(data.organic_results, 'title', 'link', 'snippet', dorkProfile.negativeKeywords, existingDomains, mode);
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
      siteType: mode === 'diy' ? 'DIY' : 'LEGACY'
    });
  }

  return leads;
}
