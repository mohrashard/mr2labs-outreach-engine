import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Exempt background worker routes, crons, webhooks, streaming PDFs and public email assets from auth checks
  if (
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

  // Check if request carries Supabase auth cookies
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.includes('auth-token') || c.name.startsWith('sb-')
  );

  if (!hasAuthCookie) {
    // Unauthenticated user with no auth cookie attempting to access protected route -> redirect immediately
    if (pathname !== '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Fetch user with a strict 3-second timeout to prevent Vercel MIDDLEWARE_INVOCATION_TIMEOUT (504)
  let user = null;
  try {
    const authPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase Auth timeout in middleware')), 3000)
    );

    const result = (await Promise.race([authPromise, timeoutPromise])) as Awaited<
      ReturnType<typeof supabase.auth.getUser>
    >;
    user = result?.data?.user ?? null;
  } catch (error) {
    console.warn('[Middleware] Auth check timed out or failed:', error);
  }

  // Redirect unauthenticated users trying to access protected routes (e.g. / or /templates) to /login
  if (!user && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users trying to access /login to root dashboard /
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
