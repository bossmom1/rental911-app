import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';
import type { Database } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client (Client Components).
 * Respects RLS as the signed-in user.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

type CookieStore = ReturnType<typeof cookies>;

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 * Pass the cookie store from `cookies()` in next/headers. Respects RLS.
 *
 * In Server Components the cookie store is read-only, so writes are wrapped in
 * try/catch — session refresh is handled by middleware instead.
 */
export function createSupabaseServerClient(cookieStore: CookieStore) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Service-role client — BYPASSES RLS. Server-only.
 * Use for privileged operations (admin toggles, background sync, webhooks).
 * NEVER import this into a Client Component.
 */
export function createSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
