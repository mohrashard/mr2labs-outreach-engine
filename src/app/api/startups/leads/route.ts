import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('startup_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (source && source !== 'ALL') {
      query = query.eq('source_type', source);
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,website_url.ilike.%${search}%,work_email.ilike.%${search}%`);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('[API /api/startups/leads] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, pitch_text, email_subject, work_email } = body;

    if (!id) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) updatePayload.status = status;
    if (pitch_text !== undefined) updatePayload.pitch_text = pitch_text;
    if (email_subject !== undefined) updatePayload.email_subject = email_subject;
    if (work_email !== undefined) updatePayload.work_email = work_email;

    const { data, error } = await supabaseAdmin
      .from('startup_leads')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
