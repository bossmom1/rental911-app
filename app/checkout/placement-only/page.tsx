'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { CardElement, Elements } from '@stripe/react-stripe-js';
import { PLACEMENT_ONLY_PER_UNIT_CENTS, ELITE_ADDON_HOURLY_CENTS, ELITE_ADDON_SERVICES } from '@/lib/landlord-onboarding-pricing';
import { useOnboardingSubmit, type CheckoutContact } from '@/components/checkout/useOnboardingSubmit';
import { submitPlacementOnlyCheckout } from './actions';

const rf = (cents: number) => '$' + Math.round(cents / 100).toLocaleString();

const CARD_ELEMENT_STYLE = {
  base: {
    fontSize: '14px',
    color: '#111827',
    fontFamily: '"Inter", sans-serif',
    fontSmoothing: 'antialiased',
    '::placeholder': { color: '#9CA3AF' },
  },
  invalid: { color: '#DC2626', iconColor: '#DC2626' },
};

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');
  return stripePromise;
}

export default function PlacementOnlyCheckoutPage() {
  return (
    <Elements stripe={getStripePromise()}>
      <PlacementOnlyCheckout />
    </Elements>
  );
}

function PlacementOnlyCheckout() {
  const router = useRouter();
  const [units, setUnits] = useState(1);
  const [elite, setElite] = useState<string[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyDetails, setPropertyDetails] = useState('');
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const submitTier = useOnboardingSubmit(submitPlacementOnlyCheckout);

  useEffect(() => {
    if (units < 6) return;
    const t = setTimeout(() => router.push('/checkout/investor'), 4000);
    return () => clearTimeout(t);
  }, [units, router]);

  function toggleElite(service: string) {
    setElite((prev) => (prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]));
  }

  const placeAmt = PLACEMENT_ONLY_PER_UNIT_CENTS * units;
  const eliteAmt = elite.length * ELITE_ADDON_HOURLY_CENTS;
  const total = placeAmt + eliteAmt;

  async function onPay() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setFieldsError('Please complete all required fields in Step 2 before paying.');
      return;
    }
    setFieldsError(null);
    const contact: CheckoutContact = { firstName, lastName, email, phone, propertyDetails };
    await submitTier.submit(contact, {
      tier: 'placement_only',
      billingOption: null,
      portfolioServiceModel: null,
      totalUnits: units,
      eliteAddonServices: elite,
      activateNow: false,
    });
  }

  return (
    <div style={{ background: '#F5F7FA', minHeight: '100vh', paddingBottom: 80 }}>
      <style jsx>{`
        .po-wrap { max-width: 680px; margin: 0 auto; padding: 0 20px; font-family: 'Inter', sans-serif; color: #111827; }
        .po-hero { background: #0C447C; text-align: center; padding: 40px 24px 32px; }
        .po-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #EF9F27; margin-bottom: 12px; }
        .po-title { font-size: 38px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.2; }
        .po-sub { font-size: 13px; color: #B5D4F4; line-height: 1.6; max-width: 480px; margin: 0 auto; }
        .po-card { background: #fff; border-radius: 12px; border: 1px solid #E5E9F0; box-shadow: 0 2px 10px rgba(0,0,0,.05); overflow: hidden; margin: 20px 0 0; }
        .po-card-head { background: #0C447C; padding: 14px 22px; }
        .po-card-head-title { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .06em; text-transform: uppercase; }
        .po-card-body { padding: 20px 22px; }
        .po-field { margin-bottom: 14px; }
        .po-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .po-input { width: 100%; padding: 10px 13px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 14px; font-family: inherit; color: #111827; outline: none; }
        .po-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .po-hint { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .po-req { color: #DC2626; margin-left: 2px; }
        .po-unit-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; background: #F9FAFB; border: 1px solid #E5E9F0; border-radius: 9px; padding: 14px 16px; }
        .po-unit-label { font-size: 13px; font-weight: 600; color: #374151; flex: 1; }
        .po-unit-input { width: 90px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 16px; font-weight: 700; color: #0C447C; font-family: inherit; text-align: center; outline: none; }
        .po-redirect { background: #0C447C; color: #fff; border-radius: 9px; padding: 16px 18px; margin-bottom: 14px; text-align: center; }
        .po-redirect-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
        .po-redirect-sub { font-size: 12px; opacity: .85; margin-bottom: 12px; line-height: 1.5; }
        .po-redirect-btn { display: inline-block; background: #EF9F27; color: #fff; font-size: 13px; font-weight: 700; padding: 10px 22px; border-radius: 7px; text-decoration: none; }
        .po-includes { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 9px; padding: 14px 16px; margin-bottom: 14px; }
        .po-inc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0369A1; margin-bottom: 10px; }
        .po-inc-item { font-size: 12px; color: #374151; padding: 4px 0; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
        .po-inc-check { color: #0369A1; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .po-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 16px 18px; margin-bottom: 14px; }
        .po-sum-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; margin-bottom: 10px; }
        .po-sum-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .po-sum-row:last-of-type { border-bottom: none; font-weight: 700; font-size: 14px; padding-top: 8px; margin-top: 4px; }
        .po-sum-val { color: #0C447C; font-weight: 600; white-space: nowrap; margin-left: 12px; }
        .po-stripe-card { border: 1px solid #D1D5DB; border-radius: 7px; padding: 13px; background: #fff; min-height: 46px; }
        .po-pay-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 14px 16px; margin-bottom: 18px; }
        .po-pay-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .po-pay-row.total { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 4px; color: #0C447C; }
        .po-btn-pay { width: 100%; padding: 16px; background: #EF9F27; color: #fff; border: none; border-radius: 8px; font-size: 17px; font-weight: 700; cursor: pointer; margin-top: 16px; font-family: inherit; }
        .po-btn-pay:disabled { opacity: .6; cursor: not-allowed; }
        .po-err { color: #DC2626; font-size: 12px; margin-top: 10px; padding: 8px 12px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 7px; line-height: 1.5; }
        .po-secure { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #9CA3AF; margin-top: 12px; }
        .po-foot { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 24px; line-height: 1.8; }
        .po-foot :global(a) { color: #0C447C; font-weight: 600; text-decoration: none; }
        @media (max-width: 500px) { .po-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="po-hero">
        <div className="po-eyebrow">Rental911 — DIY Landlord Services</div>
        <h1 className="po-title">Tenant Placement Only</h1>
        <div style={{ display: 'inline-block', background: '#EF9F27', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', padding: '7px 18px', borderRadius: 20, margin: '10px 0 14px' }}>
          ★ No Subscription Required — Pay Per Placement
        </div>
        <p className="po-sub">Professional tenant placement — one flat fee, no ongoing commitment. Optional add-on services available below.</p>
      </div>

      <div className="po-wrap">
        <div className="po-card">
          <div className="po-card-head"><div className="po-card-head-title">Step 1 — Your Placement Package</div></div>
          <div className="po-card-body">
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 3 }}>Want ongoing landlord support?</div>
                <div style={{ fontSize: 12, color: '#374151' }}>Landlord Rescue starts at <strong>$185/unit/mo</strong> — includes placement, rent collection &amp; compliance.</div>
              </div>
              <Link href="/checkout/landlord" style={{ display: 'inline-block', background: '#0C447C', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                See Landlord Rescue →
              </Link>
            </div>

            <div className="po-field">
              <label className="po-label">How many units need tenant placement?</label>
              <div className="po-unit-row">
                <div className="po-unit-label">Number of units</div>
                <input className="po-unit-input" type="number" min={1} value={units} onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="po-hint">
                1&ndash;5 units. For 6 or more, see our{' '}
                <Link href="/checkout/investor" style={{ color: '#0C447C', fontWeight: 600 }}>Portfolio Investor program →</Link>
              </div>
            </div>

            {units > 5 && (
              <div className="po-redirect">
                <div className="po-redirect-title">You Have 6+ Units — You Qualify for the Portfolio Investor Program</div>
                <div className="po-redirect-sub">
                  With {units} units, you belong in the Portfolio Investor program for better pricing and dedicated investor support.
                  <br />Redirecting you now&hellip;
                </div>
                <Link className="po-redirect-btn" href="/checkout/investor">Go to Portfolio Investor Checkout →</Link>
              </div>
            )}

            <div className="po-includes">
              <div className="po-inc-title">What&#39;s Included</div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>Regional marketing — Zillow, Realtor.com, Facebook Marketplace &amp; more</span></div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>Applicant vetting — credit, background &amp; income verification</span></div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>Maryland disclosure compliance &amp; lease execution</span></div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>Move-in walk-through &amp; key hand-off</span></div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>One flat fee — no hidden charges, no ongoing subscription</span></div>
              <div className="po-inc-item"><span className="po-inc-check">✓</span><span>You retain full control of your property — Rental911 coordinates the placement</span></div>
            </div>

            <div className="po-summary">
              <div className="po-sum-eyebrow">Your Pricing Summary</div>
              <div className="po-sum-row">
                <span>Tenant Placement — {units} unit{units > 1 ? 's' : ''} × ${PLACEMENT_ONLY_PER_UNIT_CENTS / 100} <em style={{ color: '#DC2626', fontStyle: 'normal', fontSize: 11 }}>non-refundable</em></span>
                <span className="po-sum-val">{rf(placeAmt)}</span>
              </div>
              {elite.length > 0 && (
                <div className="po-sum-row">
                  <span>Elite Asset Services ({elite.length})</span>
                  <span className="po-sum-val">{rf(eliteAmt)}</span>
                </div>
              )}
              <div className="po-sum-row"><span>Total due today</span><span className="po-sum-val">{rf(total)}</span></div>
            </div>

            <div style={{ background: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#92400E', marginBottom: 4 }}>✦ Optional — Elite Asset Services</div>
              <div style={{ fontSize: 11, color: '#78350F', marginBottom: 12 }}>${ELITE_ADDON_HOURLY_CENTS / 100}/hr — 1-hr deposit collected at checkout. Additional hours billed via metered billing.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ELITE_ADDON_SERVICES.map((service) => (
                  <label key={service} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827' }}>
                    <input type="checkbox" checked={elite.includes(service)} onChange={() => toggleElite(service)} style={{ width: 17, height: 17, accentColor: '#92400E' }} />
                    {service} <span style={{ color: '#92400E', fontWeight: 600 }}>+${ELITE_ADDON_HOURLY_CENTS / 100}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="po-card">
          <div className="po-card-head"><div className="po-card-head-title">Step 2 — Your Contact Information</div></div>
          <div className="po-card-body">
            <div className="po-row">
              <div className="po-field">
                <label className="po-label">First Name <span className="po-req">*</span></label>
                <input className="po-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </div>
              <div className="po-field">
                <label className="po-label">Last Name <span className="po-req">*</span></label>
                <input className="po-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" />
              </div>
            </div>
            <div className="po-row">
              <div className="po-field">
                <label className="po-label">Email Address <span className="po-req">*</span></label>
                <input className="po-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="email" />
              </div>
              <div className="po-field">
                <label className="po-label">Phone Number <span className="po-req">*</span></label>
                <input className="po-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(301) 555-0100" autoComplete="tel" />
              </div>
            </div>
            <div className="po-field">
              <label className="po-label">Property address or description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="po-input" rows={3} value={propertyDetails} onChange={(e) => setPropertyDetails(e.target.value)} placeholder="e.g. 2BR SFH in Waldorf MD, currently vacant" style={{ resize: 'vertical', lineHeight: 1.5 }} />
              <div className="po-hint">Helps us prepare for your placement — not required to proceed.</div>
            </div>
          </div>
        </div>

        <div className="po-card">
          <div className="po-card-head"><div className="po-card-head-title">Step 3 — Secure Payment</div></div>
          <div className="po-card-body">
            <div className="po-pay-summary">
              <div className="po-sum-eyebrow">Order Summary</div>
              <div className="po-pay-row"><span>Tenant Placement — {units} unit{units > 1 ? 's' : ''} × ${PLACEMENT_ONLY_PER_UNIT_CENTS / 100} <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 600 }}>non-refundable</span></span><span>{rf(placeAmt)}</span></div>
              {elite.map((svc) => (
                <div className="po-pay-row" key={svc}><span>Elite Asset — {svc} (1-hr deposit)</span><span>${ELITE_ADDON_HOURLY_CENTS / 100}</span></div>
              ))}
              <div className="po-pay-row total"><span>Total Due Today</span><span>{rf(total)}</span></div>
            </div>

            <div className="po-field">
              <label className="po-label">Card Details <span className="po-req">*</span></label>
              <div className="po-stripe-card"><CardElement options={{ style: CARD_ELEMENT_STYLE }} /></div>
              <div className="po-hint">Your card details are encrypted and never stored on our servers.</div>
            </div>

            {(fieldsError || submitTier.error) && <div className="po-err">{fieldsError || submitTier.error}</div>}

            <button className="po-btn-pay" type="button" onClick={onPay} disabled={submitTier.busy || !submitTier.stripeReady}>
              {submitTier.busy ? 'Processing…' : `Pay ${rf(total)} →`}
            </button>

            <div className="po-secure"><span>🔒</span><span>256-bit SSL · Secured by Stripe · No card data stored</span></div>
          </div>
        </div>

        <p className="po-foot">
          Questions? <a href="mailto:Info@rental911.net">Info@rental911.net</a> &nbsp;·&nbsp; <a href="https://rental911.net/pricing">View all services →</a><br />
          <a href="https://rental911.net/free-coaching-call">Not ready? Book a free coaching call first</a>
        </p>
      </div>
    </div>
  );
}
