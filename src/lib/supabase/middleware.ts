import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getUserFromJwtCookie(request: NextRequest): { id: string; email?: string } | null {
  try {
    const allCookies = request.cookies.getAll();
    const authCookies = allCookies.filter(
      (c) => c.name.includes('auth-token') || c.name.startsWith('sb-')
    );

    if (authCookies.length === 0) return null;

    // Check each cookie individually first (prevents multi-cookie JSON string concatenation bugs)
    for (const cookie of authCookies) {
      const val = cookie.value;
      if (!val) continue;

      let parsed: any = null;
      try {
        parsed = JSON.parse(val);
      } catch {
        try {
          parsed = JSON.parse(decodeURIComponent(val));
        } catch {}
      }

      if (parsed && typeof parsed === 'object') {
        const userObj = parsed.user || (Array.isArray(parsed) ? parsed[2]?.user : null);
        if (userObj && (userObj.id || userObj.email)) {
          return {
            id: userObj.id || 'admin_user',
            email: userObj.email,
          };
        }
      }

      const accessToken = parsed ? (Array.isArray(parsed) ? parsed[0] : parsed?.access_token) : val;
      if (accessToken && typeof accessToken === 'string' && accessToken.startsWith('ey')) {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          try {
            const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
            const payload = JSON.parse(payloadJson);
            if (payload && payload.exp && payload.exp * 1000 > Date.now() + 10000) {
              return {
                id: payload.sub || payload.user_id || 'admin_user',
                email: payload.email,
              };
            }
          } catch {}
        }
      }
    }

    // Fallback: If chunked cookies exist (.0, .1), join chunks for matching prefix
    const chunkedCookies = authCookies
      .filter((c) => /\.\d+$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (chunkedCookies.length > 0) {
      const combined = chunkedCookies.map((c) => c.value).join('');
      let parsed: any = null;
      try {
        parsed = JSON.parse(combined);
      } catch {
        try {
          parsed = JSON.parse(decodeURIComponent(combined));
        } catch {}
      }

      if (parsed) {
        const userObj = parsed.user || (Array.isArray(parsed) ? parsed[2]?.user : null);
        if (userObj && (userObj.id || userObj.email)) {
          return {
            id: userObj.id || 'admin_user',
            email: userObj.email,
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
