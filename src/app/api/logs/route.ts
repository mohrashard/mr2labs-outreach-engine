import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    
    return NextResponse.json({ logs: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
