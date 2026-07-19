'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="w-full rounded-lg px-3 py-2 text-left font-display font-bold text-white/90 hover:bg-white/10"
    >
      Sign out
    </button>
  );
}
