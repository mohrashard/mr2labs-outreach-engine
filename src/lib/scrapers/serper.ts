export interface SerperLead {
  title: string;
  url: string;
  snippet: string;
}

export async function discoverLeads(niche: string, location: string, limit: number = 20): Promise<SerperLead[]> {
  const keys = (process.env.SERPER_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('Missing SERPER_API_KEY environment variable');
  }

  const query = `${niche} in ${location}`;
  let lastError: Error | null = null;

  for (const apiKey of keys) {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: query,
          num: limit
        })
      });

      if (!response.ok) {
        throw new Error(`Serper API error (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      const leads: SerperLead[] = [];
      
      if (data.organic) {
        for (const result of data.organic) {
          const link = (result.link || '').toLowerCase();
          // Skip aggregator platforms
          if (
            link.includes('zillow.com') ||
            link.includes('redfin.com') ||
            link.includes('trulia.com') ||
            link.includes('realtor.com') ||
            link.includes('yelp.com')
          ) {
            continue;
          }

          leads.push({
            title: result.title || '',
            url: result.link || '',
            snippet: result.snippet || ''
          });
        }
      }

      return leads.slice(0, limit);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Serper Scraper] Key ${apiKey.slice(0, 6)}... failed: ${err.message}. Trying next key...`);
    }
  }

  throw lastError || new Error('All Serper API keys failed');
}


