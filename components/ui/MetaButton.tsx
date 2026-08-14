import { META_BUSINESS_SUITE_URL } from '@/lib/brand';

/**
 * Admin sidebar quick-access button for Meta Business Suite.
 * Opens Facebook Business Manager in a new tab. Same visual
 * pattern as GhlButton.tsx and AfcButton.tsx — reuses the
 * `.ghl-button` class (gold #EF9F27 background, navy text).
 */
export function MetaButton() {
  return (
    <a
      href={META_BUSINESS_SUITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ghl-button block w-full rounded-lg px-3 py-2.5 text-center"
    >
      Meta Business Suite
    </a>
  );
}
