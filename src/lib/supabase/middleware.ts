import { NextResponse, type NextRequest } from 'next/server';

function getUserFromCookies(request: NextRequest): { id: string; email: string } | null {
  try {
    // 1. Direct admin_session cookie check (100% fast, robust, reliable across all environments)
    const adminCookie = request.cookies.get('admin_session')?.value;
    if (adminCookie) {
      return {
        id: 'admin_mr2labs_user',
        email: decodeURIComponent(adminCookie),
      };
    }

    // 2. Supabase auth token cookie checks
    const allCookies = request.cookies.getAll();
    const authCookies = allCookies.filter(
      (c) => c.name.includes('auth-token') || c.name.startsWith('sb-')
    );

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
            email: userObj.email || 'admin@mr2labs.com',
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

  // Exempt public assets, auth endpoints, crons, webhooks, streaming PDFs, and public audit landing pages from middleware checks
  if (
    pathname.startsWith('/audit') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/queue') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/thumbnail') ||
    pathname.startsWith('/api/response') ||
    pathname.startsWith('/api/audit') ||
    pathname.startsWith('/api/pdf') ||
    pathname.startsWith('/api/track-intent') ||
    pathname.startsWith('/intent') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return supabaseResponse;
  }

  const user = getUserFromCookies(request);

  if (user) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Unauthenticated user trying to access protected route -> redirect to /login
  if (pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
