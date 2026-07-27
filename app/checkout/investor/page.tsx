'use client';

import { useState } from 'react';
import Link from 'next/link';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { CardElement, Elements } from '@stripe/react-stripe-js';
import {
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  ELITE_ADDON_SERVICES,
} from '@/lib/landlord-onboarding-pricing';
import { useOnboardingSubmit, type CheckoutContact } from '@/components/checkout/useOnboardingSubmit';
import { submitInvestorCheckout } from './actions';

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

export default function InvestorCheckoutPage() {
  return (
    <Elements stripe={getStripePromise()}>
      <InvestorCheckout />
    </Elements>
  );
}

function InvestorCheckout() {
  const [u1, setU1] = useState(6);
  const [r1, setR1] = useState(1500);
  const [u2, setU2] = useState(0);
  const [r2, setR2] = useState(0);
  const [option, setOption] = useState<1 | 2>(1);
  const [activateNow, setActivateNow] = useState(false);
  const [elite, setElite] = useState<string[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyDetails, setPropertyDetails] = useState('');
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const submitTier = useOnboardingSubmit(submitInvestorCheckout);

  function toggleElite(service: string) {
    setElite((prev) => (prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]));
  }

  const units = u1 + u2;
  const onboardAmt = PORTFOLIO_AUDIT_PER_UNIT_CENTS * units;
  const subRate = option === 1 ? PORTFOLIO_MONTHLY_PER_UNIT_CENTS : PORTFOLIO_QUARTERLY_PER_UNIT_CENTS;
  const subAmt = subRate * units;
  const eliteAmt = elite.length * ELITE_ADDON_HOURLY_CENTS;
  const total = onboardAmt + (activateNow ? subAmt : 0) + eliteAmt;

  const includes =
    option === 1
      ? [
          'Rent collected through the Rental911 portal — deposited directly to your merchant bank',
          <>Funds available the <strong>same day</strong> they are collected — no delays, no holds</>,
          <>Rental911 does <strong>not</strong> deduct fees from rent</>,
          `Invoiced monthly at $${PORTFOLIO_MONTHLY_PER_UNIT_CENTS / 100}/unit`,
          "Tenant placement at vacancy: 60% of 1st month's rent (regional marketing, applicant vetting, MD disclosures, move-in walk-through & key hand-off)",
          "Annual lease renewal (Year 2+): 50% of 1st month's rent per unit — tenant re-verification & MD-compliant renewal execution",
        ]
      : [
          'You manage rent collection through your own platform — Rental911 does not handle rent',
          <>Rental911 does <strong>not</strong> deduct fees from rental payments</>,
          `Invoiced quarterly at $${PORTFOLIO_QUARTERLY_PER_UNIT_CENTS / 100}/unit`,
          'Quarterly oversight, compliance monitoring & landlord support',
          "Tenant placement at vacancy: 60% of 1st month's rent (regional marketing, applicant vetting, MD disclosures, move-in walk-through & key hand-off)",
          "Annual lease renewal (Year 2+): 50% of 1st month's rent per unit — market analysis, tenant re-verification & MD-compliant renewal execution",
        ];

  async function onPay() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setFieldsError('Please complete all required fields in Steps 1 and 2 before paying.');
      return;
    }
    if (units < 6) {
      setFieldsError('This package requires a minimum of 6 units. Please update your unit count in the calculator above.');
      return;
    }
    setFieldsError(null);
    const contact: CheckoutContact = { firstName, lastName, email, phone, propertyDetails };
    await submitTier.submit(contact, {
      tier: 'portfolio',
      billingOption: null,
      portfolioServiceModel: option === 1 ? 'rental911_portal' : 'external_system',
      totalUnits: units,
      eliteAddonServices: elite,
      activateNow,
    });
  }

  return (
    <div style={{ background: '#F5F7FA', minHeight: '100vh', paddingBottom: 80 }}>
      <style jsx>{`
        .ic-wrap { max-width: 680px; margin: 0 auto; padding: 0 20px; font-family: 'Inter', sans-serif; color: #111827; }
        .ic-hero { background: #0C447C; text-align: center; padding: 40px 24px 32px; }
        .ic-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #EF9F27; margin-bottom: 12px; }
        .ic-title { font-size: 42px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.2; }
        .ic-sub { font-size: 13px; color: #B5D4F4; line-height: 1.6; max-width: 480px; margin: 0 auto; }
        .ic-card { background: #fff; border-radius: 12px; border: 1px solid #E5E9F0; box-shadow: 0 2px 10px rgba(0,0,0,.05); overflow: hidden; margin: 20px 0 0; }
        .ic-card-head { background: #0C447C; padding: 14px 22px; }
        .ic-card-head-title { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .06em; text-transform: uppercase; }
        .ic-card-body { padding: 20px 22px; }
        .ic-field { margin-bottom: 14px; }
        .ic-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .ic-input { width: 100%; padding: 10px 13px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 14px; font-family: inherit; color: #111827; outline: none; }
        .ic-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ic-hint { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .ic-req { color: #DC2626; margin-left: 2px; }
        .ic-tog-wrap { display: flex; gap: 8px; flex-wrap: wrap; }
        .ic-tog { flex: 1; min-width: 140px; padding: 11px 12px; border-radius: 8px; border: 1px solid #D1D5DB; background: #fff; cursor: pointer; font-size: 12px; font-family: inherit; color: #374151; font-weight: 500; text-align: center; }
        .ic-tog.on { background: #E6F1FB; border-color: #0C447C; color: #0C447C; font-weight: 700; }
        .ic-tog-sub { font-size: 11px; display: block; margin-top: 2px; opacity: .8; }
        .ic-includes { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 9px; padding: 14px 16px; margin-top: 12px; }
        .ic-inc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0369A1; margin-bottom: 10px; }
        .ic-inc-item { font-size: 12px; color: #374151; padding: 4px 0; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
        .ic-inc-check { color: #0369A1; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .ic-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 16px 18px; margin-top: 14px; }
        .ic-sum-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; margin-bottom: 10px; }
        .ic-sum-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .ic-sum-row:last-of-type { border-bottom: none; font-weight: 700; font-size: 14px; padding-top: 8px; margin-top: 4px; }
        .ic-sum-val { color: #0C447C; font-weight: 600; }
        .ic-stripe-card { border: 1px solid #D1D5DB; border-radius: 7px; padding: 13px; background: #fff; min-height: 46px; }
        .ic-pay-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 14px 16px; margin-bottom: 18px; }
        .ic-pay-sum-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .ic-pay-sum-row.total { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 4px; color: #0C447C; }
        .ic-btn-pay { width: 100%; padding: 16px; background: #EF9F27; color: #fff; border: none; border-radius: 8px; font-size: 17px; font-weight: 700; cursor: pointer; margin-top: 16px; font-family: inherit; }
        .ic-btn-pay:disabled { opacity: .6; cursor: not-allowed; }
        .ic-err { color: #DC2626; font-size: 12px; margin-top: 10px; padding: 8px 12px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 7px; line-height: 1.5; }
        .ic-secure { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #9CA3AF; margin-top: 12px; }
        .ic-group-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0C447C; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #E5E9F0; }
        .ic-foot { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 24px; line-height: 1.8; }
        .ic-foot :global(a) { color: #0C447C; font-weight: 600; text-decoration: none; }
        @media (max-width: 500px) { .ic-row { grid-template-columns: 1fr; } .ic-tog { min-width: 100%; } }
      `}</style>

      <div className="ic-hero">
        <div className="ic-eyebrow">Rental911 — Portfolio Investor</div>
        <h1 className="ic-title">Remote Investor Partner Package</h1>
        <div style={{ display: 'inline-block', background: '#EF9F27', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', padding: '7px 18px', borderRadius: 20, margin: '10px 0 14px' }}>
          ★ Invitation-Only — Investor Owners With 6+ Properties
        </div>
        <p className="ic-sub">Calculate your pricing below, then complete the form and pay securely. A confirmation will be sent to your email automatically.</p>
      </div>

      <div className="ic-wrap">
        <div className="ic-card">
          <div className="ic-card-head"><div className="ic-card-head-title">Step 1 — Calculate Your Pricing</div></div>
          <div className="ic-card-body">
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 3 }}>Have fewer than 6 units?</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Try <Link href="/checkout/landlord" style={{ color: '#0C447C', fontWeight: 700 }}>Landlord Rescue</Link> or{' '}
                  <Link href="/checkout/placement-only" style={{ color: '#0C447C', fontWeight: 700 }}>Placement Only</Link>.
                </div>
              </div>
            </div>

            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
              <strong>⚠ This package requires a minimum of 6 units total.</strong> Use the groups below to enter all of your properties.
            </div>

            <div className="ic-group-label">Property Group 1</div>
            <div className="ic-row">
              <div className="ic-field">
                <label className="ic-label">Number of units</label>
                <input className="ic-input" type="number" min={6} max={200} value={u1} onChange={(e) => setU1(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="ic-field">
                <label className="ic-label">Avg monthly rent</label>
                <input className="ic-input" type="number" min={0} max={20000} value={r1} onChange={(e) => setR1(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            <div className="ic-group-label" style={{ marginTop: 6 }}>
              Property Group 2 <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9CA3AF' }}>(optional)</span>
            </div>
            <div className="ic-row">
              <div className="ic-field">
                <label className="ic-label">Number of units</label>
                <input className="ic-input" type="number" min={0} max={200} value={u2} onChange={(e) => setU2(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="ic-field">
                <label className="ic-label">Avg monthly rent</label>
                <input className="ic-input" type="number" min={0} max={20000} value={r2} onChange={(e) => setR2(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>All units in Southern Maryland (Charles, St. Mary&#39;s, or Prince George&#39;s County)</div>

            <div className="ic-field">
              <label className="ic-label">Billing preference</label>
              <div className="ic-tog-wrap">
                <button type="button" className={`ic-tog${option === 1 ? ' on' : ''}`} onClick={() => setOption(1)}>
                  Option 1 — Rental911 Portal
                  <span className="ic-tog-sub">Monthly · ${PORTFOLIO_MONTHLY_PER_UNIT_CENTS / 100}/unit</span>
                </button>
                <button type="button" className={`ic-tog${option === 2 ? ' on' : ''}`} onClick={() => setOption(2)}>
                  Option 2 — External System
                  <span className="ic-tog-sub">Quarterly · ${PORTFOLIO_QUARTERLY_PER_UNIT_CENTS / 100}/unit</span>
                </button>
              </div>
            </div>

            <div className="ic-includes">
              <div className="ic-inc-title">Option {option} — What&#39;s Included</div>
              {includes.map((item, i) => (
                <div key={i} className="ic-inc-item"><span className="ic-inc-check">✓</span><span>{item}</span></div>
              ))}
            </div>

            <div className="ic-summary">
              <div className="ic-sum-eyebrow">Your pricing summary</div>
              <div className="ic-sum-row"><span>Portfolio audit ({units} units × ${PORTFOLIO_AUDIT_PER_UNIT_CENTS / 100})</span><span className="ic-sum-val">{rf(onboardAmt)}</span></div>
              <div className="ic-sum-row" style={{ opacity: activateNow ? 1 : 0.5, fontWeight: activateNow ? 600 : 400 }}>
                <span>{option === 1 ? 'Monthly' : 'Quarterly'} subscription ({units} units × ${subRate / 100})</span>
                <span className="ic-sum-val">{activateNow ? rf(subAmt) : 'Billed in 30 days'}</span>
              </div>
              <div className="ic-sum-row"><span>Total due at signing</span><span className="ic-sum-val">{rf(activateNow ? onboardAmt + subAmt : onboardAmt)}</span></div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #BFDBFE', fontSize: 11, color: '#6B7280' }}>
                <strong style={{ color: '#374151' }}>Per-event rates (billed when applicable):</strong><br />
                {u1 > 0 && r1 > 0 && <>Group 1 — Placement: ${Math.round(r1 * 0.6).toLocaleString()}/vacancy · Renewal: ${Math.round(r1 * 0.5).toLocaleString()}/unit<br /></>}
                {u2 > 0 && r2 > 0 && <>Group 2 — Placement: ${Math.round(r2 * 0.6).toLocaleString()}/vacancy · Renewal: ${Math.round(r2 * 0.5).toLocaleString()}/unit</>}
              </div>
            </div>

            <div style={{ background: '#EFF6FF', border: '2px solid #0C447C', borderRadius: 10, padding: '14px 16px', marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#0C447C', marginBottom: 8 }}>✓ Optional — Activate Now</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} style={{ marginTop: 3, accentColor: '#0C447C', width: 18, height: 18, flexShrink: 0 }} />
                <label style={{ fontSize: 13, color: '#111827', lineHeight: 1.6 }}>
                  <strong style={{ color: '#0C447C' }}>Check here to start management today</strong> — your first {option === 1 ? 'monthly' : 'quarterly'} subscription
                  fee will be charged now and coverage begins the day you sign.
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Leave unchecked to be invoiced for your subscription 30 days from today.</div>
                </label>
              </div>
            </div>

            <div style={{ background: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: 10, padding: '14px 16px', marginTop: 14 }}>
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

        <div className="ic-card">
          <div className="ic-card-head"><div className="ic-card-head-title">Step 2 — Your Contact Information</div></div>
          <div className="ic-card-body">
            <div className="ic-row">
              <div className="ic-field">
                <label className="ic-label">First Name <span className="ic-req">*</span></label>
                <input className="ic-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </div>
              <div className="ic-field">
                <label className="ic-label">Last Name <span className="ic-req">*</span></label>
                <input className="ic-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" />
              </div>
            </div>
            <div className="ic-row">
              <div className="ic-field">
                <label className="ic-label">Email Address <span className="ic-req">*</span></label>
                <input className="ic-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="email" />
              </div>
              <div className="ic-field">
                <label className="ic-label">Phone Number <span className="ic-req">*</span></label>
                <input className="ic-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(301) 555-0100" autoComplete="tel" />
              </div>
            </div>
            <div className="ic-field">
              <label className="ic-label">Property addresses or brief description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="ic-input" rows={3} value={propertyDetails} onChange={(e) => setPropertyDetails(e.target.value)} placeholder="e.g. 3 SFH in Waldorf MD, 1 duplex in La Plata MD" style={{ resize: 'vertical', lineHeight: 1.5 }} />
              <div className="ic-hint">Helps us prepare your onboarding — not required to proceed.</div>
            </div>
          </div>
        </div>

        <div className="ic-card">
          <div className="ic-card-head"><div className="ic-card-head-title">Step 3 — Secure Payment</div></div>
          <div className="ic-card-body">
            <div className="ic-pay-summary">
              <div className="ic-sum-eyebrow">Order Summary</div>
              <div className="ic-pay-sum-row"><span>Portfolio Audit — {units} units × ${PORTFOLIO_AUDIT_PER_UNIT_CENTS / 100}</span><span>{rf(onboardAmt)}</span></div>
              {activateNow && (
                <div className="ic-pay-sum-row"><span>{option === 1 ? 'Monthly' : 'Quarterly'} subscription</span><span>{rf(subAmt)}</span></div>
              )}
              {elite.map((svc) => (
                <div className="ic-pay-sum-row" key={svc}><span>Elite Asset — {svc} (1-hr deposit)</span><span>${ELITE_ADDON_HOURLY_CENTS / 100}</span></div>
              ))}
              <div className="ic-pay-sum-row total"><span>Total Due Today</span><span>{rf(total)}</span></div>
            </div>

            <div className="ic-field">
              <label className="ic-label">Card Details <span className="ic-req">*</span></label>
              <div className="ic-stripe-card"><CardElement options={{ style: CARD_ELEMENT_STYLE }} /></div>
              <div className="ic-hint">Your card details are encrypted and never stored on our servers.</div>
            </div>

            {(fieldsError || submitTier.error) && <div className="ic-err">{fieldsError || submitTier.error}</div>}

            <button className="ic-btn-pay" type="button" onClick={onPay} disabled={submitTier.busy || !submitTier.stripeReady}>
              {submitTier.busy ? 'Processing…' : `Pay ${rf(total)}`}
            </button>

            <div className="ic-secure"><span>🔒</span><span>256-bit SSL · Secured by Stripe · No card data stored</span></div>
          </div>
        </div>

        <p className="ic-foot">
          Private page — not listed in navigation.<br />
          Questions? <a href="mailto:Info@rental911.net">Info@rental911.net</a> &nbsp;·&nbsp; <a href="tel:2404664445" style={{ color: '#0C447C', fontWeight: 600 }}>240.466.4445</a>
        </p>
      </div>
    </div>
  );
}
