'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { CardElement, Elements } from '@stripe/react-stripe-js';
import {
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  ELITE_ADDON_SERVICES,
} from '@/lib/landlord-onboarding-pricing';
import { useOnboardingSubmit, type CheckoutContact } from '@/components/checkout/useOnboardingSubmit';
import { submitLandlordCheckout } from './actions';

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

export default function LandlordCheckoutPage() {
  return (
    <Elements stripe={getStripePromise()}>
      <LandlordCheckout />
    </Elements>
  );
}

function LandlordCheckout() {
  const router = useRouter();
  const [units, setUnits] = useState(1);
  const [avgRent, setAvgRent] = useState(1500);
  const [billing, setBilling] = useState<1 | 2>(1);
  const [activateNow, setActivateNow] = useState(false);
  const [elite, setElite] = useState<string[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyDetails, setPropertyDetails] = useState('');
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const submitTier = useOnboardingSubmit(submitLandlordCheckout);

  // Redirect at 6+ units, same 4-second auto-redirect the old page used.
  useEffect(() => {
    if (units < 6) return;
    const t = setTimeout(() => router.push('/checkout/investor'), 4000);
    return () => clearTimeout(t);
  }, [units, router]);

  function toggleElite(service: string) {
    setElite((prev) => (prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]));
  }

  const onboardAmt = STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS * units;
  const subRate = billing === 1 ? STANDARD_MONTHLY_PER_UNIT_CENTS : STANDARD_QUARTERLY_PER_UNIT_CENTS;
  const subAmt = subRate * units;
  const eliteAmt = elite.length * ELITE_ADDON_HOURLY_CENTS;
  const total = onboardAmt + (activateNow ? subAmt : 0) + eliteAmt;

  const includes =
    billing === 1
      ? [
          'Rent collected through the Rental911 portal — deposited directly to your bank',
          <>Funds available the <strong>same day</strong> they are collected — no delays, no holds</>,
          <>Rental911 does <strong>not</strong> deduct fees from rent</>,
          `Invoiced monthly at $${STANDARD_MONTHLY_PER_UNIT_CENTS / 100}/unit — Tenant Placement Plus: $${STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS / 100} one-time fee`,
          "Tenant placement at vacancy: 60% of 1st month's rent (regional marketing, applicant vetting, MD disclosures, move-in walk-through & key hand-off)",
          "Annual lease renewal (Year 2+): 50% of 1st month's rent per unit — tenant re-verification & MD-compliant renewal execution",
        ]
      : [
          'Rent collected through the Rental911 portal — deposited directly to your bank',
          <>Funds available the <strong>same day</strong> they are collected — no delays, no holds</>,
          <>Rental911 does <strong>not</strong> deduct fees from rent</>,
          `Invoiced quarterly at $${STANDARD_QUARTERLY_PER_UNIT_CENTS / 100}/unit every 3 months — Tenant Placement Plus: $${STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS / 100} one-time fee`,
          "Tenant placement at vacancy: 60% of 1st month's rent (regional marketing, applicant vetting, MD disclosures, move-in walk-through & key hand-off)",
          "Annual lease renewal (Year 2+): 50% of 1st month's rent per unit — tenant re-verification & MD-compliant renewal execution",
        ];

  async function onPay() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setFieldsError('Please complete all required fields in Step 2 before paying.');
      return;
    }
    setFieldsError(null);
    const contact: CheckoutContact = { firstName, lastName, email, phone, propertyDetails };
    await submitTier.submit(contact, {
      tier: 'standard',
      billingOption: billing === 1 ? 'monthly' : 'quarterly',
      portfolioServiceModel: null,
      totalUnits: units,
      eliteAddonServices: elite,
      activateNow,
    });
  }

  return (
    <div style={{ background: '#F5F7FA', minHeight: '100vh', paddingBottom: 80 }}>
      <style jsx>{`
        .co-wrap { max-width: 680px; margin: 0 auto; padding: 0 20px; font-family: 'Inter', sans-serif; color: #111827; }
        .co-hero { background: #0C447C; text-align: center; padding: 40px 24px 32px; }
        .co-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #EF9F27; margin-bottom: 12px; }
        .co-title { font-size: 38px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.2; }
        .co-sub { font-size: 13px; color: #B5D4F4; line-height: 1.6; max-width: 480px; margin: 0 auto; }
        .co-card { background: #fff; border-radius: 12px; border: 1px solid #E5E9F0; box-shadow: 0 2px 10px rgba(0,0,0,.05); overflow: hidden; margin: 20px 0 0; }
        .co-card-head { background: #0C447C; padding: 14px 22px; }
        .co-card-head-title { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .06em; text-transform: uppercase; }
        .co-card-body { padding: 20px 22px; }
        .co-field { margin-bottom: 14px; }
        .co-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .co-input { width: 100%; padding: 10px 13px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 14px; font-family: inherit; color: #111827; outline: none; }
        .co-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .co-hint { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .co-req { color: #DC2626; margin-left: 2px; }
        .co-unit-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; background: #F9FAFB; border: 1px solid #E5E9F0; border-radius: 9px; padding: 14px 16px; }
        .co-unit-label { font-size: 13px; font-weight: 600; color: #374151; flex: 1; }
        .co-unit-input { width: 90px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 16px; font-weight: 700; color: #0C447C; font-family: inherit; text-align: center; outline: none; }
        .co-redirect { background: #0C447C; color: #fff; border-radius: 9px; padding: 16px 18px; margin-bottom: 14px; text-align: center; }
        .co-redirect-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
        .co-redirect-sub { font-size: 12px; opacity: .85; margin-bottom: 12px; line-height: 1.5; }
        .co-redirect-btn { display: inline-block; background: #EF9F27; color: #fff; font-size: 13px; font-weight: 700; padding: 10px 22px; border-radius: 7px; text-decoration: none; }
        .co-tog-wrap { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .co-tog { flex: 1; min-width: 140px; padding: 11px 12px; border-radius: 8px; border: 1px solid #D1D5DB; background: #fff; cursor: pointer; font-size: 12px; font-family: inherit; color: #374151; font-weight: 500; text-align: center; }
        .co-tog.on { background: #E6F1FB; border-color: #0C447C; color: #0C447C; font-weight: 700; }
        .co-tog-sub { font-size: 11px; display: block; margin-top: 2px; opacity: .8; }
        .co-includes { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 9px; padding: 14px 16px; margin-bottom: 14px; }
        .co-inc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0369A1; margin-bottom: 10px; }
        .co-inc-item { font-size: 12px; color: #374151; padding: 4px 0; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
        .co-inc-check { color: #0369A1; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .co-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 16px 18px; margin-bottom: 14px; }
        .co-sum-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; margin-bottom: 10px; }
        .co-sum-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .co-sum-row:last-of-type { border-bottom: none; font-weight: 700; font-size: 14px; padding-top: 8px; margin-top: 4px; }
        .co-sum-val { color: #0C447C; font-weight: 600; white-space: nowrap; margin-left: 12px; }
        .co-sum-val.faded { color: #9CA3AF; font-weight: 400; font-style: italic; }
        .co-activate { background: #EFF6FF; border: 2px solid #0C447C; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
        .co-activate-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0C447C; margin-bottom: 10px; }
        .co-activate-row { display: flex; align-items: flex-start; gap: 12px; }
        .co-addon-callout { background: #FFFBEB; border: 2px solid #FDE68A; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
        .co-addon-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #92400E; margin-bottom: 4px; }
        .co-addon-body { font-size: 11px; color: #78350F; margin-bottom: 12px; }
        .co-stripe-card { border: 1px solid #D1D5DB; border-radius: 7px; padding: 13px; background: #fff; min-height: 46px; }
        .co-pay-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 14px 16px; margin-bottom: 18px; }
        .co-pay-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .co-pay-row.total { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 4px; color: #0C447C; }
        .co-btn-pay { width: 100%; padding: 16px; background: #EF9F27; color: #fff; border: none; border-radius: 8px; font-size: 17px; font-weight: 700; cursor: pointer; margin-top: 16px; font-family: inherit; }
        .co-btn-pay:disabled { opacity: .6; cursor: not-allowed; }
        .co-err { color: #DC2626; font-size: 12px; margin-top: 10px; padding: 8px 12px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 7px; line-height: 1.5; }
        .co-secure { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #9CA3AF; margin-top: 12px; }
        .co-foot { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 24px; line-height: 1.8; }
        .co-foot :global(a) { color: #0C447C; font-weight: 600; text-decoration: none; }
        @media (max-width: 500px) { .co-row { grid-template-columns: 1fr; } .co-tog { min-width: 100%; } }
      `}</style>

      <div className="co-hero">
        <div className="co-eyebrow">Rental911 — DIY Landlord Services</div>
        <h1 className="co-title">Landlord Rescue — Enroll Now</h1>
        <div style={{ display: 'inline-block', background: '#EF9F27', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', padding: '7px 18px', borderRadius: 20, margin: '10px 0 14px' }}>
          ★ Southern Maryland&#39;s #1 Landlord Support Service
        </div>
        <p className="co-sub">Select your billing preference, confirm your unit count, and pay securely below.</p>
      </div>

      <div className="co-wrap">
        <div className="co-card">
          <div className="co-card-head"><div className="co-card-head-title">Step 1 — Your Package &amp; Billing Preference</div></div>
          <div className="co-card-body">
            <div className="co-field">
              <label className="co-label">How many rental units are you enrolling?</label>
              <div className="co-unit-row">
                <div className="co-unit-label">Number of units</div>
                <input className="co-unit-input" type="number" min={1} value={units} onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="co-hint">
                1&ndash;5 units. For 6 or more, see our{' '}
                <Link href="/checkout/investor" style={{ color: '#0C447C', fontWeight: 600 }}>Portfolio Investor program →</Link>
              </div>
            </div>

            {units > 5 && (
              <div className="co-redirect">
                <div className="co-redirect-title">You Have 6+ Units — You Qualify for the Portfolio Investor Program</div>
                <div className="co-redirect-sub">
                  The Landlord Rescue checkout is designed for landlords with 1&ndash;5 units. With {units} units, you belong in the
                  Portfolio Investor program for better pricing and dedicated investor support.<br />Redirecting you now&hellip;
                </div>
                <Link className="co-redirect-btn" href="/checkout/investor">Go to Portfolio Investor Checkout →</Link>
              </div>
            )}

            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>Just need tenant placement? No subscription.</div>
                <div style={{ fontSize: 12, color: '#78350F' }}>Flat $875/unit — no ongoing commitment required.</div>
              </div>
              <Link href="/checkout/placement-only" style={{ display: 'inline-block', background: '#EF9F27', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Placement Only →
              </Link>
            </div>

            <div className="co-field">
              <label className="co-label">Billing preference</label>
              <div className="co-tog-wrap">
                <button type="button" className={`co-tog${billing === 1 ? ' on' : ''}`} onClick={() => setBilling(1)}>
                  Option 1 — Monthly
                  <span className="co-tog-sub">${STANDARD_MONTHLY_PER_UNIT_CENTS / 100}/unit · Billed monthly</span>
                </button>
                <button type="button" className={`co-tog${billing === 2 ? ' on' : ''}`} onClick={() => setBilling(2)}>
                  Option 2 — Quarterly
                  <span className="co-tog-sub">${STANDARD_QUARTERLY_PER_UNIT_CENTS / 100}/unit · Billed every 3 months</span>
                </button>
              </div>
            </div>

            <div className="co-includes">
              <div className="co-inc-title">Option {billing} — What&#39;s Included</div>
              {includes.map((item, i) => (
                <div key={i} className="co-inc-item"><span className="co-inc-check">✓</span><span>{item}</span></div>
              ))}
            </div>

            <div className="co-summary">
              <div className="co-sum-eyebrow">Your Pricing Summary</div>
              <div className="co-sum-row">
                <span>Tenant Placement Plus ({units} unit{units > 1 ? 's' : ''} × ${STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS / 100}) — <em style={{ color: '#DC2626', fontStyle: 'normal', fontSize: 11 }}>non-refundable</em></span>
                <span className="co-sum-val">{rf(onboardAmt)}</span>
              </div>
              <div className="co-sum-row">
                <span>{billing === 1 ? 'Monthly' : 'Quarterly'} subscription ({units} unit{units > 1 ? 's' : ''} × ${subRate / 100}/{billing === 1 ? 'mo' : 'qtr'})</span>
                <span className={`co-sum-val${activateNow ? '' : ' faded'}`}>{activateNow ? rf(subAmt) : 'Billed in 30 days'}</span>
              </div>
              <div className="co-sum-row">
                <span>Total due at signing</span>
                <span className="co-sum-val">{rf(total)}</span>
              </div>
            </div>

            <div className="co-activate">
              <div className="co-activate-eyebrow">✓ Optional — Activate Subscription Now</div>
              <div className="co-activate-row">
                <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#0C447C', marginTop: 2, flexShrink: 0 }} />
                <label style={{ fontSize: 13, color: '#111827', lineHeight: 1.6 }}>
                  <strong style={{ color: '#0C447C' }}>Check here to start your subscription today</strong> — your first subscription
                  payment will be charged now and coverage begins immediately.
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Leave unchecked to be invoiced for your subscription 30 days after joining Rental911.</div>
                </label>
              </div>
            </div>

            <div className="co-addon-callout">
              <div className="co-addon-title">✦ Optional — Elite Asset Services</div>
              <div className="co-addon-body">${ELITE_ADDON_HOURLY_CENTS / 100}/hr — 1-hr deposit collected at checkout. Additional hours billed via metered billing.</div>
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

        <div className="co-card">
          <div className="co-card-head"><div className="co-card-head-title">Step 2 — Your Contact Information</div></div>
          <div className="co-card-body">
            <div className="co-row">
              <div className="co-field">
                <label className="co-label">First Name <span className="co-req">*</span></label>
                <input className="co-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </div>
              <div className="co-field">
                <label className="co-label">Last Name <span className="co-req">*</span></label>
                <input className="co-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" />
              </div>
            </div>
            <div className="co-row">
              <div className="co-field">
                <label className="co-label">Email Address <span className="co-req">*</span></label>
                <input className="co-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="email" />
              </div>
              <div className="co-field">
                <label className="co-label">Phone Number <span className="co-req">*</span></label>
                <input className="co-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(301) 555-0100" autoComplete="tel" />
              </div>
            </div>
            <div className="co-field">
              <label className="co-label">Property address(es) or description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="co-input" rows={3} value={propertyDetails} onChange={(e) => setPropertyDetails(e.target.value)} placeholder="e.g. 1 SFH in Waldorf MD, La Plata duplex" style={{ resize: 'vertical', lineHeight: 1.5 }} />
              <div className="co-hint">Helps us prepare your file — not required to proceed.</div>
            </div>
          </div>
        </div>

        <div className="co-card">
          <div className="co-card-head"><div className="co-card-head-title">Step 3 — Secure Payment</div></div>
          <div className="co-card-body">
            <div className="co-pay-summary">
              <div className="co-sum-eyebrow">Order Summary</div>
              <div className="co-pay-row"><span>Tenant Placement Plus — {units} unit{units > 1 ? 's' : ''} × ${STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS / 100} <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 600 }}>non-refundable</span></span><span>{rf(onboardAmt)}</span></div>
              {activateNow && (
                <div className="co-pay-row"><span>Landlord Rescue — {units} unit{units > 1 ? 's' : ''} × ${subRate / 100}/{billing === 1 ? 'mo' : 'qtr'}</span><span>{rf(subAmt)}</span></div>
              )}
              {elite.map((svc) => (
                <div className="co-pay-row" key={svc}><span>Elite Asset — {svc} (1-hr deposit)</span><span>${ELITE_ADDON_HOURLY_CENTS / 100}</span></div>
              ))}
              <div className="co-pay-row total"><span>Total Due Today</span><span>{rf(total)}</span></div>
            </div>

            <div className="co-field">
              <label className="co-label">Card Details <span className="co-req">*</span></label>
              <div className="co-stripe-card"><CardElement options={{ style: CARD_ELEMENT_STYLE }} /></div>
              <div className="co-hint">Your card details are encrypted and never stored on our servers.</div>
            </div>

            {(fieldsError || submitTier.error) && <div className="co-err">{fieldsError || submitTier.error}</div>}

            <button className="co-btn-pay" type="button" onClick={onPay} disabled={submitTier.busy || !submitTier.stripeReady}>
              {submitTier.busy ? 'Processing…' : `Pay ${rf(total)} →`}
            </button>

            <div className="co-secure">
              <span>🔒</span><span>256-bit SSL · Secured by Stripe · No card data stored</span>
            </div>
          </div>
        </div>

        <p className="co-foot">
          Questions? <a href="mailto:Info@rental911.net">Info@rental911.net</a> &nbsp;·&nbsp; <a href="https://rental911.net/pricing">View all services →</a><br />
          <a href="https://rental911.net/free-coaching-call">Not ready? Book a free coaching call first</a>
        </p>
      </div>
    </div>
  );
}
