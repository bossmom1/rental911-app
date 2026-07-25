import { AFC_HOME_CLUB_URL } from '@/lib/brand';

/**
 * Admin sidebar quick-access button — a manual login shortcut only
 * (Christine still logs in herself); separate from the backend AFC
 * automation in lib/afc.ts. Same visual pattern as GhlButton.tsx — reuses
 * the `.ghl-button` class since there's no distinct AFC brand color defined
 * in this app (both are the same gold/orange, #EF9F27).
 */
export function AfcButton() {
  return (
    <a
      href={AFC_HOME_CLUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ghl-button block w-full rounded-lg px-3 py-2.5 text-center"
    >
      AFC Home Club
    </a>
  );
}
