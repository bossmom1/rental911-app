import { GHL_CRM_URL } from '@/lib/brand';

/**
 * Required admin sidebar button: Gold background, Navy text,
 * label "GoHighLevel CRM". Opens the GHL app in a new tab. Always visible.
 */
export function GhlButton() {
  return (
    <a
      href={GHL_CRM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ghl-button block w-full rounded-lg px-3 py-2.5 text-center"
    >
      GoHighLevel CRM
    </a>
  );
}
