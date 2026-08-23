import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const NICHE_FALLBACK_TEMPLATES = [
  {
    niche_name: "Real Estate Agency",
    pain_points: "Slow MLS listing loads, losing local SEO to Zillow/Redfin aggregators, poor mobile image optimization.",
    mr2_solution: "MR² Labs builds Next.js applications that statically generate MLS listings for instant loading, outranking aggregators on Google, and delivering an app-like mobile experience."
  },
  {
    niche_name: "Law Firm",
    pain_points: "Low trust signals on mobile, slow client intake forms, outdated partner profiles.",
    mr2_solution: "MR² Labs creates high-authority Next.js sites with secure, instant-load client intake portals and premium localized SEO."
  },
  {
    niche_name: "E-Commerce",
    pain_points: "High cart abandonment due to slow page loads, poor Core Web Vitals, expensive Shopify app bloat.",
    mr2_solution: "MR² Labs migrates stores to Next.js headless commerce, dropping page load times to under 1 second and increasing conversion rates."
  },
  {
    niche_name: "Dental Practice",
    pain_points: "No online booking integration, slow mobile pages, poor local Google Maps SEO presence.",
    mr2_solution: "MR² Labs builds Next.js patient portals with automated booking, fast mobile loads, and localized schema markup."
  },
  {
    niche_name: "General B2B",
    pain_points: "Legacy WordPress/Wix layout, slow mobile performance, lack of automated lead capture workflows.",
    mr2_solution: "MR² Labs engineers high-converting Next.js web applications tailored for speed, SEO domination, and seamless lead conversion."
  }
];

// GET: Fetch all templates
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('pitch_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Templates API] Supabase query error (table pitch_templates may not be created yet):', error.message);
      // Table does not exist in Supabase yet, return fallback static list
      return NextResponse.json({ templates: NICHE_FALLBACK_TEMPLATES, isFallback: true });
    }

    // Return the actual templates stored in database (even if empty [])
    return NextResponse.json({ templates: data || [], isFallback: false });
  } catch (err: any) {
    console.error('[Templates API GET Error]:', err);
    return NextResponse.json({ templates: NICHE_FALLBACK_TEMPLATES, isFallback: true });
  }
}

// POST: Add new template
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niche_name, pain_points, mr2_solution, is_technical_audience } = body;

    if (!niche_name || !pain_points || !mr2_solution) {
      return NextResponse.json({ error: 'niche_name, pain_points, and mr2_solution are required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('pitch_templates')
      .upsert(
        { 
          niche_name: niche_name.trim(), 
          pain_points: pain_points.trim(), 
          mr2_solution: mr2_solution.trim(),
          is_technical_audience: !!is_technical_audience 
        },
        { onConflict: 'niche_name' }
      )
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, template: data });
  } catch (err: any) {
    console.error('[Templates API POST Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to create/update template' }, { status: 500 });
  }
}

// PUT: Update an existing template by ID or niche_name
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, niche_name, pain_points, mr2_solution, is_technical_audience } = body;

    if (!id && !niche_name) {
      return NextResponse.json({ error: 'ID or niche_name is required for update.' }, { status: 400 });
    }

    let query = supabaseAdmin.from('pitch_templates');
    let updateQuery = id 
      ? query.update({ niche_name, pain_points, mr2_solution, is_technical_audience: !!is_technical_audience }).eq('id', id)
      : query.update({ pain_points, mr2_solution, is_technical_audience: !!is_technical_audience }).eq('niche_name', niche_name);

    const { data, error } = await updateQuery.select('*').single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, template: data });
  } catch (err: any) {
    console.error('[Templates API PUT Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update template' }, { status: 500 });
  }
}

// DELETE: Remove a template by ID or niche_name
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const niche_name = searchParams.get('niche_name');

    if (!id && !niche_name) {
      return NextResponse.json({ error: 'Template ID or niche_name is required.' }, { status: 400 });
    }

    let query = supabaseAdmin.from('pitch_templates').delete();
    if (id) {
      query = query.eq('id', id);
    } else if (niche_name) {
      query = query.eq('niche_name', niche_name);
    }

    const { error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Templates API DELETE Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete template' }, { status: 500 });
  }
}
