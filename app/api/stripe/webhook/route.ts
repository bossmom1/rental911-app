import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /api/stripe/webhook
 *
 * PHASE 2. Rent collection + Stripe Connect are not built in Phase 1, so this
 * handler is a verified stub. It confirms signature configuration wiring and
 * acknowledges events without acting on them.
 *
 * Phase 2 will handle: payment_intent.succeeded, payment_intent.payment_failed,
 * account.updated — creating rent_payments rows, generating PDF receipts, and
 * notifying landlord/tenant on failure.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Not configured yet — acknowledge so Stripe test pings don't error loudly.
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set (Phase 2).');
    return NextResponse.json({ received: true, phase: 1 });
  }

  const rawBody = await request.text();
  // Phase 2: verify with stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  console.log('[stripe/webhook] received event (signature present:', Boolean(signature), ')');
  void rawBody;

  return NextResponse.json({ received: true });
}
