import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: List all campaigns with associated lead counts
export async function GET() {
  try {
    const { data: campaigns, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch lead counts per campaign
    const enrichedCampaigns = await Promise.all(
      (campaigns || []).map(async (c) => {
        const { count: totalLeads } = await supabaseAdmin
          .from('outreach_leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id);

        const { count: newLeadsToday } = await supabaseAdmin
          .from('outreach_leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)
          .eq('status', 'NEW');

        return {
          ...c,
          total_leads: totalLeads || 0,
          new_leads: newLeadsToday || 0,
        };
      })
    );

    return NextResponse.json({ campaigns: enrichedCampaigns });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create a new campaign
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, niche, location, daily_lead_limit, start_date, end_date } = body;

    if (!name || !niche || !location) {
      return NextResponse.json({ error: 'Name, niche, and location are required fields.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const startDate = start_date ? new Date(start_date).toISOString() : now;
    
    // Default end date to 30 days from now if not specified
    let endDate = end_date ? new Date(end_date).toISOString() : null;
    if (!endDate) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      endDate = d.toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name: name.trim(),
        niche: niche.trim(),
        location: location.trim(),
        daily_lead_limit: Number(daily_lead_limit) || 20,
        start_date: startDate,
        end_date: endDate,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('system_logs').insert({
      event_type: 'CAMPAIGN_CREATED',
      message: `🆕 New campaign created: "${data.name}" (${data.niche} in ${data.location})`,
      metadata: { campaignId: data.id, name: data.name }
    });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Update campaign fields or toggle active/paused state
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, is_active, name, niche, location, daily_lead_limit, end_date } = body;

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required for update.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (name) updates.name = name.trim();
    if (niche) updates.niche = niche.trim();
    if (location) updates.location = location.trim();
    if (daily_lead_limit !== undefined) updates.daily_lead_limit = Number(daily_lead_limit) || 20;
    if (end_date) updates.end_date = new Date(end_date).toISOString();

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const statusText = is_active === true ? 'resumed' : is_active === false ? 'paused' : 'updated';
    await supabaseAdmin.from('system_logs').insert({
      event_type: 'CAMPAIGN_UPDATED',
      message: `⚙️ Campaign ${statusText}: "${data.name}"`,
      metadata: { campaignId: data.id, updates }
    });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove a campaign by ID
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required for deletion.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await supabaseAdmin.from('system_logs').insert({
      event_type: 'CAMPAIGN_DELETED',
      message: `🗑️ Campaign deleted (ID: ${id})`,
      metadata: { campaignId: id }
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
