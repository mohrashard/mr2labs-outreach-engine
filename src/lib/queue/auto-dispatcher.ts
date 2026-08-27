import { supabaseAdmin } from '@/lib/supabase/admin';
import { processSingleQueuedLead } from '@/app/api/queue/send-email/route';

let isDispatching = false;

/**
 * Self-Healing Auto-Dispatcher
 * Scans outreach_leads for any QUEUED leads whose scheduled_for time has passed,
 * and immediately triggers processSingleQueuedLead.
 */
export async function autoDispatchPastDueLeads() {
  if (isDispatching) return;
  isDispatching = true;

  try {
    const now = new Date().toISOString();
    const { data: pastDueQueued, error } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, follow_up_step, company_name, email')
      .eq('status', 'QUEUED')
      .lte('scheduled_for', now)
      .limit(10);

    if (error || !pastDueQueued || pastDueQueued.length === 0) {
      isDispatching = false;
      return;
    }

    console.log(`[Auto-Dispatcher] Found ${pastDueQueued.length} past-due queued lead(s). Dispatching now...`);

    for (const item of pastDueQueued) {
      try {
        await processSingleQueuedLead(item.id, item.follow_up_step || 0);
        console.log(`[Auto-Dispatcher] Dispatched lead: ${item.company_name || item.email} (Step ${item.follow_up_step})`);
      } catch (err: any) {
        console.error(`[Auto-Dispatcher Error] Failed to process ${item.email}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[Auto-Dispatcher Crash]:', err.message);
  } finally {
    isDispatching = false;
  }
}
