import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { ROLE_HOME } from '@/lib/routes';
import type { User, UserRole } from '@/types/database';

/**
 * Server helper: return the signed-in auth user + their public.users profile,
 * or null if not signed in. Use in Server Components / Route Handlers.
 */
export async function getCurrentUser(): Promise<{
  authId: string;
  email: string;
  profile: User | null;
} | null> {
  const supabase = createSupabaseServerClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { authId: user.id, email: user.email ?? '', profile };
}

/**
 * Require a signed-in user with one of the allowed roles. Redirects to /login
 * if signed out, or to the user's own home if the role doesn't match.
 * Returns the profile when authorized.
 */
export async function requireRole(allowed: UserRole[]): Promise<User> {
  const current = await getCurrentUser();
  if (!current) redirect('/login');
  const role = current!.profile?.role;
  if (!role) redirect('/login');
  if (!allowed.includes(role)) redirect(ROLE_HOME[role]);
  return current!.profile as User;
}
