import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { requireSupabaseEnv } from '@/lib/supabase-env';

/**
 * Browser-side Supabase client (Client Components).
 * Respects RLS as the signed-in user.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const client = createBrowserClient<Database>(url, anonKey);

  // @supabase/ssr's browser client hydrates its session from cookies
  // asynchronously, but the Realtime module isn't authenticated with that
  // session's JWT until explicitly set — without this, every
  // postgres_changes subscription connects unauthenticated and RLS silently
  // drops every event (confirmed: raw supabase-js with a signed-in session
  // receives events fine; this client without it never does).
  client.auth.onAuthStateChange((_event, session) => {
    if (session) client.realtime.setAuth(session.access_token);
  });

  return client;
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
  const { url, anonKey } = requireSupabaseEnv();
  return createServerClient<Database>(url, anonKey, {
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
  const { url } = requireSupabaseEnv();
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
