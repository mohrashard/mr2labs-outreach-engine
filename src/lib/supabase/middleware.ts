import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getUserFromJwtCookie(request: NextRequest): { id: string; email?: string } | null {
  try {
    const allCookies = request.cookies.getAll();
    const authCookies = allCookies
      .filter((c) => c.name.includes('auth-token'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (authCookies.length === 0) return null;

    const rawValue = authCookies.map((c) => c.value).join('');
    if (!rawValue) return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      try {
        parsed = JSON.parse(decodeURIComponent(rawValue));
      } catch {}
    }

    if (parsed && (parsed.user || parsed.access_token)) {
      if (parsed.user && (parsed.user.id || parsed.user.email)) {
        return {
          id: parsed.user.id || 'admin_user',
          email: parsed.user.email,
        };
      }
    }

    const accessToken = parsed ? (Array.isArray(parsed) ? parsed[0] : parsed?.access_token) : rawValue;

    if (accessToken && typeof accessToken === 'string') {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        if (payload && payload.exp && payload.exp * 1000 > Date.now() + 10000) {
          return {
            id: payload.sub || payload.user_id || 'admin_user',
            email: payload.email,
          };
        }
      }
    }
  } catch (err) {
    // Ignore parse errors
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Exempt background worker routes, auth endpoints, crons, webhooks, streaming PDFs and public email assets from auth checks
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/queue') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/thumbnail') ||
    pathname.startsWith('/api/response') ||
    pathname.startsWith('/api/audit') ||
    pathname.startsWith('/api/pdf') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return supabaseResponse;
  }

  // 1. Fast path: Extract user directly from valid cookie/session (0ms execution, no network latency)
  const jwtUser = getUserFromJwtCookie(request);

  if (jwtUser) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 2. No valid JWT/session cookie found
  if (pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. Unauthenticated visitor on /login -> allow access instantly
  return supabaseResponse;
}
