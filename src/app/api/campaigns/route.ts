import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { name, niche, location, start_date, end_date } = await req.json();
    
    const { data, error } = await supabaseAdmin.from('campaigns').insert({
      name, niche, location, start_date, end_date, is_active: true
    }).select().single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
