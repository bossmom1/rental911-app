/**
 * Supabase env validation, kept in its own module so `middleware.ts` can share
 * it without pulling the Supabase SDKs (and the service-role admin client) into
 * the Edge bundle.
 *
 * Reference `process.env.NEXT_PUBLIC_*` as full literals — Next.js does a
 * static text replacement at build time, so destructuring or aliasing them
 * would break client-side inlining.
 */

/**
 * NEXT_PUBLIC_* vars are inlined at build time. If they're missing — or still
 * the .env.example placeholders — fail with an actionable message instead of
 * the opaque error @supabase/ssr throws, or a client silently pointed at a
 * hostname that doesn't resolve.
 */
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url || url.includes('your-project-ref')) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!anonKey || anonKey.startsWith('your-anon')) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (missing.length) {
    throw new Error(
      `Supabase is not configured: ${missing.join(', ')} ${
        missing.length > 1 ? 'are' : 'is'
      } missing or still set to the .env.example placeholder. ` +
        'Copy the real Project URL and anon key from your Supabase dashboard ' +
        '(Settings -> API) into .env.local, then restart the dev server.'
    );
  }
  return { url: url!, anonKey: anonKey! };
}
