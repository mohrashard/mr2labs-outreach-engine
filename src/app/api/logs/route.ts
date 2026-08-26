import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Event types that must always be visible regardless of volume
const PRIORITY_EVENTS = ['COOLDOWN', 'SCRAPE_START', 'SCRAPE_ENQUEUED', 'QUOTA_MET', 'LOCATION_PIVOT', 'CRON_ERROR'];

export async function GET() {
  try {
    // Fetch latest activity (high-volume bouncer events etc.)
    const { data: recentLogs, error: e1 } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);

    if (e1) throw e1;

    // Always fetch the latest priority cron-lifecycle events separately
    const { data: priorityLogs, error: e2 } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .in('event_type', PRIORITY_EVENTS)
      .order('created_at', { ascending: false })
      .limit(20);

    if (e2) throw e2;

    // Merge, deduplicate by id, sort newest first
    const merged = [...(recentLogs || []), ...(priorityLogs || [])];
    const seen = new Set<string>();
    const deduped = merged.filter(log => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });
    deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return NextResponse.json({ logs: deduped });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
