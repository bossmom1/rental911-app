import { NextResponse } from 'next/server';

/**
 * /api/stripe/connect
 *
 * PHASE 2. Stripe Connect Express onboarding (landlord payout accounts) is
 * built in Phase 2 as part of onboarding Step 6. This stub returns 501 so the
 * route exists and is clearly not yet active.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Stripe Connect onboarding is delivered in Phase 2.',
    },
    { status: 501 }
  );
}

export async function GET() {
  return NextResponse.json({ ok: false, phase: 2 }, { status: 501 });
}
