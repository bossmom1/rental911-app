import type { Vendor } from '@/types/database';

/**
 * Live-computed lapsed check — the source of truth for "should this vendor be
 * hidden from tenant self-dispatch right now," independent of whether
 * vendors.is_hidden_lapsed has been refreshed. There's no cron in this app to
 * flip that column the instant next_reverification_due passes, so anywhere
 * this actually matters (the tenant dropdown query, the admin vendor list's
 * visual flag) should call this rather than trust the stored column alone.
 */
export function isVendorLapsed(vendor: Pick<Vendor, 'license_status' | 'next_reverification_due' | 'is_hidden_lapsed'>): boolean {
  if (vendor.is_hidden_lapsed) return true;
  if (vendor.license_status === 'expired') return true;
  if (vendor.next_reverification_due && new Date(vendor.next_reverification_due) < new Date()) return true;
  return false;
}

/** How overdue a 'pending' dispatch is, in hours, for the no-response flag (2x avg_response_hours). */
export function hoursSinceDispatch(dispatchedAt: string): number {
  return (Date.now() - new Date(dispatchedAt).getTime()) / (1000 * 60 * 60);
}

export function isDispatchOverdue(
  dispatch: { vendor_response: string | null; dispatched_at: string },
  avgResponseHours: number
): boolean {
  if (dispatch.vendor_response !== 'pending') return false;
  return hoursSinceDispatch(dispatch.dispatched_at) > 2 * avgResponseHours;
}

/** Absolute URL to the vendor's public (unauthenticated) confirmation page. */
export function vendorConfirmUrl(dispatchId: string, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/vendor/confirm/${dispatchId}`;
}
