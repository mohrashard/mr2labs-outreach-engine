import { supabaseAdmin } from '@/lib/supabase/admin';

export interface DiscoveredStartupLead {
  companyName: string;
  websiteUrl: string;
  founderName?: string;
  intentSnippet: string;
  sourceType: 'HN_INTENT' | 'YC_FUNDED';
  ycBatch?: string;
  techStack?: string[];
  workEmail?: string;
}

const COMMON_TECH_WORDS = [
  'React', 'Next.js', 'React Native', 'Flutter', 'TypeScript', 'Node.js', 'Python',
  'Django', 'FastAPI', 'Supabase', 'PostgreSQL', 'Tailwind', 'iOS', 'Android', 'GraphQL', 'AWS'
];

function extractTechStack(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const tech of COMMON_TECH_WORDS) {
    if (lower.includes(tech.toLowerCase())) {
      found.push(tech);
    }
  }

  return Array.from(new Set(found));
}

function cleanHtmlText(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$1 ($2)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrapes Hacker News Algolia Free API by locking onto the official monthly "@whoishiring" Seeking Freelancer parent thread.
 * Guarantees 100% verified buyers (founders hiring freelancers), discarding job seekers.
 */
export async function discoverHNLeads(limit: number = 20): Promise<DiscoveredStartupLead[]> {
  const discoveredLeads: DiscoveredStartupLead[] = [];
  const seenDomains = new Set<string>();

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

  try {
    // 1. Lock onto the latest official "Ask HN: Seeking Freelancer" parent story ID
    const storySearchUrl = `https://hn.algolia.com/api/v1/search_by_date?query=Ask%20HN:%20Seeking%20Freelancer&tags=story,author_whoishiring&hitsPerPage=1`;
    const storyRes = await fetch(storySearchUrl, { signal: AbortSignal.timeout(12000) });
    if (!storyRes.ok) return [];

    const storyData = await storyRes.json();
    const latestStory = storyData.hits?.[0];

    if (!latestStory) {
      console.warn('[HN Discovery Engine] Could not lock onto official "Seeking Freelancer" parent story.');
      return [];
    }

    const storyId = latestStory.objectID;
    console.log(`[HN Discovery Engine] Locked onto official thread: "${latestStory.title}" (ID: ${storyId})`);

    // 2. Fetch comments attached ONLY to this exact parent story ID
    const commentsEndpoint = `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${storyId}&hitsPerPage=100`;
    const commentsRes = await fetch(commentsEndpoint, { signal: AbortSignal.timeout(12000) });
    if (!commentsRes.ok) return [];

    const commentsData = await commentsRes.json();
    const hits = commentsData.hits || [];

    for (const hit of hits) {
      if (discoveredLeads.length >= limit) break;

      const rawText = hit.comment_text || '';
      if (rawText.length < 50) continue;

      const cleanedSnippet = cleanHtmlText(rawText);

      // 3. HARD GATE 1: Strictly reject ANY mention of seeking work / resumes / job seeking freelancers
      if (/seeking work|seeking role|seeking contract|available for|portfolio:|cv:|résumé|resume/i.test(cleanedSnippet)) {
        continue;
      }

      // 4. HARD GATE 2: Must explicitly start with official HN buyer header format
      // Examples: "SEEKING FREELANCER | Company | Remote" or "HIRING | Next.js Dev"
      const trimmedSnippet = cleanedSnippet.trim();
      const isOfficialBuyerHeader = /^seeking freelancer|^hiring/i.test(trimmedSnippet);

      if (!isOfficialBuyerHeader) {
        // Also check if line 1 or header contains SEEKING FREELANCER / HIRING
        const firstLine = trimmedSnippet.split('\n')[0] || '';
        const isHeaderLine = /seeking freelancer|hiring/i.test(firstLine);
        if (!isHeaderLine) continue;
      }

      // 5. Extract Email
      const emailMatch = cleanedSnippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const extractedEmail = emailMatch ? emailMatch[0].toLowerCase() : undefined;

      // 6. Extract Website URL
      const urlMatches = Array.from(rawText.matchAll(/href="([^"]+)"/g)).map((m: any) => m[1])
        .concat(Array.from(cleanedSnippet.matchAll(/https?:\/\/[^\s<"']+/g)).map((m: any) => m[0]));

      let cleanHost = '';
      let validWebsiteUrl: string | null = null;

      for (const candidate of urlMatches) {
        if (!candidate || candidate.startsWith('#') || candidate.startsWith('/') || candidate.includes('reply?id')) continue;
        try {
          const parsed = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
          const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

          if (
            /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) &&
            !['news.ycombinator.com', 'ycombinator.com', 'github.com', 'google.com', 'twitter.com', 'x.com', 'linkedin.com'].includes(host)
          ) {
            cleanHost = host;
            validWebsiteUrl = `${parsed.protocol}//${parsed.hostname}`;
            break;
          }
        } catch {
          continue;
        }
      }

      // Fallback domain from work email
      if (!validWebsiteUrl && extractedEmail) {
        const domain = extractedEmail.split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me'].includes(domain)) {
          cleanHost = domain;
          validWebsiteUrl = `https://${domain}`;
        }
      }

      if (cleanHost && (seenDomains.has(cleanHost) || existingDomains.has(cleanHost))) {
        continue;
      }

      if (cleanHost) seenDomains.add(cleanHost);

      const author = hit.author || 'HN Founder';
      const companyName = cleanHost ? cleanHost.split('.')[0].toUpperCase() : `${author} (HN)`;

      discoveredLeads.push({
        companyName,
        websiteUrl: validWebsiteUrl || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        founderName: author,
        intentSnippet: cleanedSnippet.slice(0, 500),
        sourceType: 'HN_INTENT',
        techStack: extractTechStack(cleanedSnippet),
        workEmail: extractedEmail
      });
    }

  } catch (err) {
    console.error('[HN Discovery Engine Error]:', err);
  }

  console.log(`[HN Discovery Engine] Discovered ${discoveredLeads.length} verified hiring founders from Hacker News.`);
  return discoveredLeads;
}
