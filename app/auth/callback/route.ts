import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { ROLE_HOME } from '@/lib/routes';
import type { UserRole } from '@/types/database';

/**
 * Email-confirmation / OAuth callback. Exchanges the `code` for a session,
 * then routes the user to their role home (or the onboarding wizard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectedFrom = searchParams.get('redirectedFrom');

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  if (redirectedFrom) {
    return NextResponse.redirect(`${origin}${redirectedFrom}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let dest = '/login';
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = profile?.role as UserRole | undefined;
    if (role) dest = ROLE_HOME[role];
  }
  return NextResponse.redirect(`${origin}${dest}`);
}
