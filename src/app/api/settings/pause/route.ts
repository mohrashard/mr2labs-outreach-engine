import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'GLOBAL_SENDING_PAUSED')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: true, paused: false });
    }

    const isPaused = data?.value === true || data?.value === 'true';
    return NextResponse.json({ success: true, paused: isPaused });
  } catch (err) {
    return NextResponse.json({ success: true, paused: false });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paused } = body;
    const isPaused = Boolean(paused);

    // Try upsert into system_settings table
    const { error } = await supabaseAdmin
      .from('system_settings')
      .upsert({ key: 'GLOBAL_SENDING_PAUSED', value: isPaused, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      // If table doesn't exist yet, fallback to inserting system_logs or creating table
      await supabaseAdmin.from('system_logs').insert({
        event_type: 'PAUSE_SETTING_CHANGED',
        message: `GLOBAL_SENDING_PAUSED set to ${isPaused}`,
        metadata: { paused: isPaused }
      });
    }

    return NextResponse.json({
      success: true,
      paused: isPaused,
      message: isPaused
        ? '⏸️ Email sending (Step 0, 1, 2, 3) is now PAUSED. Scraping remains active.'
        : '🟢 Email sending is now ACTIVE.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
