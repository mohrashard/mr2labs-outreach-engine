import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const leadId = searchParams.get('id');

  if (!leadId) {
    // Missing params, silently redirect to homepage
    return NextResponse.redirect('https://mr2labs.com');
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.mr2labs.com';
    
    // Redirect to the new intent selection page, no logging here!
    return NextResponse.redirect(`${appUrl}/intent/${leadId}`);
  } catch (error) {
    console.error('[Magic Link Error]', error);
    // Silent fail fallback to the homepage so the UX doesn't break
    return NextResponse.redirect('https://mr2labs.com');
  }
}
