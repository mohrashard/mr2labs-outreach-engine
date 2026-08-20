export interface SerperLead {
  title: string;
  url: string;
  snippet: string;
}

export async function discoverLeads(niche: string, location: string, limit: number = 20): Promise<SerperLead[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing SERPER_API_KEY environment variable');
  }

  const query = `${niche} in ${location}`;
  
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
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
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
}
