import { NextResponse } from 'next/server';
import { runStartupDiscovery } from '@/lib/scraper/startup-discovery-runner';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceType, ycBatch, limit } = body;

    if (!sourceType || !['HN_INTENT', 'YC_FUNDED'].includes(sourceType)) {
      return NextResponse.json({ error: 'Valid sourceType (HN_INTENT or YC_FUNDED) is required' }, { status: 400 });
    }

    const result = await runStartupDiscovery({
      sourceType: sourceType as 'HN_INTENT' | 'YC_FUNDED',
      ycBatch: ycBatch || 'W24',
      limit: limit || 20
    });

    return NextResponse.json({
      message: `Scrape trigger complete. Found and saved ${result.count} startup leads.`,
      count: result.count,
      leads: result.leads
    });
  } catch (err: any) {
    console.error('[API /api/startups/scrape] Error:', err);
    return NextResponse.json({ error: err.message || 'Scrape trigger failed' }, { status: 500 });
  }
}
