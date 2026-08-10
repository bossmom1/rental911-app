import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/maintenance/trigger-billing  { requestId }
 *
 * Called non-blocking from StatusUpdater when a request is marked `completed`.
 * Checks whether the request was above the landlord's threshold (approved_at set),
 * has a billing amount, and hasn't been billed yet. If all three conditions hold,
 * creates a Stripe PaymentIntent against the landlord's stripe_customer_id and
 * records it on the row.
 *
 * This endpoint is intentionally forgiving — a soft failure here never blocks
 * the status change that triggered it.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let requestId: string | undefined;
  try {
    ({ requestId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
  if (!requestId) {
    return NextResponse.json({ ok: false, error: 'requestId required' }, { status: 400 });
  }

  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('id, landlord_id, billing_amount_cents, approved_at, stripe_payment_intent_id, billed_at')
    .eq('id', requestId)
    .maybeSingle();

  if (!req) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  // Only charge if: approved (was over threshold), has a billing amount, not yet billed.
  if (!req.approved_at || !req.billing_amount_cents || req.billed_at) {
    return NextResponse.json({ ok: true, billed: false });
  }

  if (!req.landlord_id) {
    return NextResponse.json({ ok: false, error: 'no landlord_id on request' }, { status: 400 });
  }

  const { data: landlord } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', req.landlord_id)
    .maybeSingle();

  if (!landlord?.stripe_customer_id) {
    console.error('[trigger-billing] landlord %s has no stripe_customer_id', req.landlord_id);
    return NextResponse.json({ ok: false, error: 'no stripe customer' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: req.billing_amount_cents,
      currency: 'usd',
      customer: landlord.stripe_customer_id,
      description: `Maintenance repair — request ${requestId}`,
      metadata: { maintenance_request_id: requestId },
    });

    await supabase
      .from('maintenance_requests')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        billed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return NextResponse.json({ ok: true, billed: true, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error('[trigger-billing] Stripe PaymentIntent creation failed (non-blocking):', err);
    return NextResponse.json({ ok: false, error: 'stripe_error' }, { status: 200 });
  }
}
