import { supabaseAdmin } from '@/lib/supabase/admin';
import { discoverHNLeads, DiscoveredStartupLead } from './hn-discovery';
import { discoverYCLeads } from './yc-discovery';

export interface StartupDiscoveryOptions {
  sourceType: 'HN_INTENT' | 'YC_FUNDED';
  ycBatch?: string;
  limit?: number;
  campaignId?: string;
}

/**
 * Runs intent discovery (HN or YC), deduplicates against Supabase, and saves candidates to startup_leads.
 */
export async function runStartupDiscovery(options: StartupDiscoveryOptions): Promise<{
  count: number;
  leads: DiscoveredStartupLead[];
}> {
  const limit = options.limit || 20;
  let rawLeads: DiscoveredStartupLead[] = [];

  if (options.sourceType === 'HN_INTENT') {
    rawLeads = await discoverHNLeads(limit);
  } else if (options.sourceType === 'YC_FUNDED') {
    rawLeads = await discoverYCLeads(options.ycBatch || 'W24', limit);
  }

  if (rawLeads.length === 0) {
    return { count: 0, leads: [] };
  }

  // Insert discovered leads into 'startup_leads'
  const dbRows = rawLeads.map((lead) => ({
    campaign_id: options.campaignId || null,
    company_name: lead.companyName,
    website_url: lead.websiteUrl,
    founder_name: lead.founderName || null,
    work_email: lead.workEmail || null,
    source_type: lead.sourceType,
    yc_batch: lead.ycBatch || null,
    tech_stack: lead.techStack || [],
    intent_snippet: lead.intentSnippet,
    status: 'NEW',
    raw_scraped_data: {
      discovered_at: new Date().toISOString(),
      discovery_source: lead.sourceType
    }
  }));

  const { data, error } = await supabaseAdmin
    .from('startup_leads')
    .insert(dbRows)
    .select('id, company_name, website_url');

  if (error) {
    console.error('[Startup Discovery Runner] Database insertion error:', error);
    return { count: 0, leads: [] };
  }

  console.log(`[Startup Discovery Runner] Successfully inserted ${data?.length || 0} startup leads into Supabase.`);
  return {
    count: data?.length || 0,
    leads: rawLeads
  };
}
