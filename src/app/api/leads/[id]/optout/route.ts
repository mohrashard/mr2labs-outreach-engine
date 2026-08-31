import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    // 1. Fetch lead email
    const { data: lead, error: fetchErr } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, email, company_name')
      .eq('id', id)
      .single();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    // 2. Update outreach_leads record
    const { error: updateErr } = await supabaseAdmin
      .from('outreach_leads')
      .update({
        status: 'STOP',
        reply_status: 'STOP',
        replied_at: nowIso,
      })
      .eq('id', id);

    if (updateErr) {
      console.warn('[OPTOUT] Warning updating lead status:', updateErr.message);
    }

    // 3. Add to suppression_list table
    if (lead.email) {
      const cleanEmail = lead.email.trim().toLowerCase();
      try {
        await supabaseAdmin
          .from('suppression_list')
          .upsert(
            {
              email: cleanEmail,
              opted_out_at: nowIso,
              reason: 'USER_OPT_OUT',
            },
            { onConflict: 'email' }
          );
      } catch (suppErr) {
        console.warn('[OPTOUT] Suppression list upsert warning:', suppErr);
      }
    }

    // 4. Log to activity_logs
    await supabaseAdmin.from('activity_logs').insert({
      lead_id: id,
      event_type: 'OPTED_OUT',
      payload: { email: lead.email, company_name: lead.company_name, timestamp: nowIso },
    });

    return NextResponse.json({
      success: true,
      message: `Lead ${id} (${lead.email}) marked as STOP and added to suppression list.`,
    });
  } catch (err: any) {
    console.error('[OPTOUT API ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
