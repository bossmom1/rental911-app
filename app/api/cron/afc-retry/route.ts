import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { submitClaimInvoice, submitWarrantyPurchaseInvoice } from '@/lib/afc';

/**
 * GET /api/cron/afc-retry — runs once daily (see vercel.json). Vercel's
 * Hobby plan only supports daily-or-less-frequent cron schedules; bump this
 * to something more frequent (e.g. every 15 min) if/when the project moves
 * to a Pro plan.
 *
 * Safety net for the two AFC automations, which normally run inline
 * (warranty invoice, app/(admin)/admin/properties/[propertyId]/actions.ts)
 * or via waitUntil (claim invoice, app/(tenant)/tenant/maintenance/actions.ts)
 * and can fail or get killed before completing. Retries anything left in a
 * non-terminal state for more than 5 minutes (a floor well below the daily
 * cadence — it's just a "don't retry something still actively processing"
 * guard, not the real retry interval). Batch-limited per run so one
 * invocation can't run long enough to hit the function's own time limit —
 * anything left over is picked up on the next run.
 */

const STALE_MINUTES = 5;
const BATCH_LIMIT = 5;

// Headless-browser runs are slow; give this route the same generous budget
// as the two inline trigger points (see lib/afc-browser.ts).
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret itself isn't configured
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  // ---- Retry stale/failed claim invoices ------------------------------------
  const { data: staleClaims } = await admin
    .from('afc_claim_invoices')
    .select('id, maintenance_request_id')
    .in('status', ['pending', 'failed'])
    .lt('generated_at', staleCutoff)
    .limit(BATCH_LIMIT);

  let claimsRetried = 0;
  let claimsSucceeded = 0;
  for (const claim of staleClaims ?? []) {
    if (!claim.maintenance_request_id) continue;
    claimsRetried++;
    const result = await submitClaimInvoice(claim.maintenance_request_id);
    await admin
      .from('afc_claim_invoices')
      .update(
        result.ok
          ? { status: 'submitted', submitted_at: new Date().toISOString() }
          : { status: 'failed', error: result.error }
      )
      .eq('id', claim.id);
    if (result.ok) claimsSucceeded++;
  }

  // ---- Retry stale warranty-purchase invoices --------------------------------
  const { data: staleProperties } = await admin
    .from('properties')
    .select('id')
    .eq('warranty_path', 'afc')
    .not('afc_tier', 'is', null)
    .is('afc_warranty_invoice_sent_at', null)
    .limit(BATCH_LIMIT);

  let warrantiesRetried = 0;
  let warrantiesSucceeded = 0;
  for (const property of staleProperties ?? []) {
    warrantiesRetried++;
    const result = await submitWarrantyPurchaseInvoice(property.id);
    if (result.ok) {
      warrantiesSucceeded++;
      await admin
        .from('properties')
        .update({ afc_warranty_invoice_sent_at: new Date().toISOString() })
        .eq('id', property.id);
    }
  }

  return NextResponse.json({
    ok: true,
    claimsRetried,
    claimsSucceeded,
    warrantiesRetried,
    warrantiesSucceeded,
  });
}
