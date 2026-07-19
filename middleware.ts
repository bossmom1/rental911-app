import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requiredRoleForPath, ROLE_HOME } from '@/lib/routes';
import { requireSupabaseEnv } from '@/lib/supabase-env';
import type { UserRole } from '@/types/database';

/**
 * Role-based route protection + Supabase session refresh.
 *
 * - Refreshes the auth session cookie on every request.
 * - Guards /admin, /landlord, /tenant by role.
 * - Sends incomplete-onboarding landlords to the wizard.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url: supabaseUrl, anonKey } = requireSupabaseEnv();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const requiredRole = requiredRoleForPath(pathname);

  // Not signed in and hitting a protected route -> login.
  if (!user && requiredRole) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  if (user && requiredRole) {
    const { data: profile } = await supabase
      .from('users')
      .select('role, onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();

    const role = profile?.role as UserRole | undefined;

    // Role mismatch -> bounce to the user's own home.
    if (role && role !== requiredRole) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[role];
      return NextResponse.redirect(url);
    }

    // Landlord who hasn't finished onboarding -> wizard (except the wizard itself).
    if (
      role === 'landlord' &&
      !profile?.onboarding_complete &&
      !pathname.startsWith('/landlord/onboarding')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/landlord/onboarding';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
