import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { id, email_subject, audit_notes, pitch_text, status } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Lead ID required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('outreach_leads')
      .update({
        email_subject,
        audit_notes,
        pitch_text,
        status
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, lead: data });
  } catch (error: any) {
    console.error('[Update Lead API Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
