'use client';

import { useState } from 'react';
import Link from 'next/link';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { CardElement, Elements } from '@stripe/react-stripe-js';
import { MEMBERSHIP_SETUP_FEE_CENTS, MEMBERSHIP_MONTHLY_CENTS } from '@/lib/membership-pricing';
import { useMembershipSubmit } from '@/components/checkout/useMembershipSubmit';
import type { MembershipContactInput } from './actions';

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

export default function MembershipCheckoutPage() {
  return (
    <Elements stripe={getStripePromise()}>
      <MembershipCheckout />
    </Elements>
  );
}

function MembershipCheckout() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyDetails, setPropertyDetails] = useState('');
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const submitTier = useMembershipSubmit();

  const total = MEMBERSHIP_SETUP_FEE_CENTS + MEMBERSHIP_MONTHLY_CENTS;

  async function onPay() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setFieldsError('Please complete all required fields in Step 2 before paying.');
      return;
    }
    setFieldsError(null);
    const contact: MembershipContactInput = { firstName, lastName, email, phone, propertyDetails };
    await submitTier.submit(contact);
  }

  return (
    <div style={{ background: '#F5F7FA', minHeight: '100vh', paddingBottom: 80 }}>
      <style jsx>{`
        .mc-wrap { max-width: 680px; margin: 0 auto; padding: 0 20px; font-family: 'Inter', sans-serif; color: #111827; }
        .mc-hero { background: #0C447C; text-align: center; padding: 40px 24px 32px; }
        .mc-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #EF9F27; margin-bottom: 12px; }
        .mc-title { font-size: 38px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.2; }
        .mc-sub { font-size: 13px; color: #B5D4F4; line-height: 1.6; max-width: 480px; margin: 0 auto; }
        .mc-card { background: #fff; border-radius: 12px; border: 1px solid #E5E9F0; box-shadow: 0 2px 10px rgba(0,0,0,.05); overflow: hidden; margin: 20px 0 0; }
        .mc-card-head { background: #0C447C; padding: 14px 22px; }
        .mc-card-head-title { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .06em; text-transform: uppercase; }
        .mc-card-body { padding: 20px 22px; }
        .mc-field { margin-bottom: 14px; }
        .mc-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .mc-input { width: 100%; padding: 10px 13px; border: 1px solid #D1D5DB; border-radius: 7px; font-size: 14px; font-family: inherit; color: #111827; outline: none; }
        .mc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mc-hint { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
        .mc-req { color: #DC2626; margin-left: 2px; }
        .mc-includes { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 9px; padding: 14px 16px; margin-bottom: 14px; }
        .mc-inc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #0369A1; margin-bottom: 10px; }
        .mc-inc-item { font-size: 12px; color: #374151; padding: 4px 0; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
        .mc-inc-check { color: #0369A1; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .mc-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 16px 18px; margin-bottom: 14px; }
        .mc-sum-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; margin-bottom: 10px; }
        .mc-sum-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .mc-sum-row:last-of-type { border-bottom: none; font-weight: 700; font-size: 14px; padding-top: 8px; margin-top: 4px; }
        .mc-sum-val { color: #0C447C; font-weight: 600; white-space: nowrap; margin-left: 12px; }
        .mc-stripe-card { border: 1px solid #D1D5DB; border-radius: 7px; padding: 13px; background: #fff; min-height: 46px; }
        .mc-pay-summary { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 9px; padding: 14px 16px; margin-bottom: 18px; }
        .mc-pay-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
        .mc-pay-row.total { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 4px; color: #0C447C; }
        .mc-btn-pay { width: 100%; padding: 16px; background: #EF9F27; color: #fff; border: none; border-radius: 8px; font-size: 17px; font-weight: 700; cursor: pointer; margin-top: 16px; font-family: inherit; }
        .mc-btn-pay:disabled { opacity: .6; cursor: not-allowed; }
        .mc-err { color: #DC2626; font-size: 12px; margin-top: 10px; padding: 8px 12px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 7px; line-height: 1.5; }
        .mc-secure { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #9CA3AF; margin-top: 12px; }
        .mc-foot { text-align: center; font-size: 11px; color: #9CA3AF; margin-top: 24px; line-height: 1.8; }
        .mc-foot :global(a) { color: #0C447C; font-weight: 600; text-decoration: none; }
        @media (max-width: 500px) { .mc-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="mc-hero">
        <div className="mc-eyebrow">Rental911 — DIY Landlord Services</div>
        <h1 className="mc-title">DIY Landlord Membership — Join Now</h1>
        <div style={{ display: 'inline-block', background: '#EF9F27', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', padding: '7px 18px', borderRadius: 20, margin: '10px 0 14px' }}>
          ★ Month-to-Month — Cancel Anytime
        </div>
        <p className="mc-sub">Coaching, tools, and compliance support for self-managing landlords. Confirm your info and pay securely below.</p>
      </div>

      <div className="mc-wrap">
        <div className="mc-card">
          <div className="mc-card-head"><div className="mc-card-head-title">Step 1 — Your Membership</div></div>
          <div className="mc-card-body">
            <div className="mc-includes">
              <div className="mc-inc-title">What&#39;s Included</div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Bi-weekly live Q&amp;A coaching sessions (2x/month)</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>On-Demand Q&amp;A Replays — catch up anytime</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Southern Maryland vendor referral network</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Maryland compliance document library</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Discounted upgrade path into the Landlord Rescue Subscription</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Month-to-month — cancel anytime</span></div>
            </div>

            <div className="mc-summary">
              <div className="mc-sum-eyebrow">Your Pricing Summary</div>
              <div className="mc-sum-row">
                <span>Setup Fee <em style={{ color: '#DC2626', fontStyle: 'normal', fontSize: 11 }}>non-refundable</em></span>
                <span className="mc-sum-val">{rf(MEMBERSHIP_SETUP_FEE_CENTS)}</span>
              </div>
              <div className="mc-sum-row">
                <span>Monthly Membership (first month, billed today)</span>
                <span className="mc-sum-val">{rf(MEMBERSHIP_MONTHLY_CENTS)}</span>
              </div>
              <div className="mc-sum-row">
                <span>Total due at signing</span>
                <span className="mc-sum-val">{rf(total)}</span>
              </div>
            </div>

            <div className="mc-includes">
              <div className="mc-inc-title">What Your $295 Setup Fee Covers</div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Existing Lease Review — your current lease checked against the 2026 Maryland Tenant Bill of Rights, Fair Housing, and your county&#39;s addenda</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Member File &amp; Platform Setup — your account built and ready day one</span></div>
              <div className="mc-inc-item"><span className="mc-inc-check">✓</span><span>Compliance Document Library — delivered day one</span></div>
            </div>

            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 3 }}>Need fuller-service placement + ongoing support instead?</div>
                <div style={{ fontSize: 12, color: '#374151' }}>Landlord Rescue Subscription starts at <strong>$185/mo</strong> — includes placement, rent collection &amp; compliance. Otherwise, members upgrade at a discounted $195 onboarding fee.</div>
              </div>
              <Link href="/checkout/landlord" style={{ display: 'inline-block', background: '#0C447C', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                See Landlord Rescue →
              </Link>
            </div>
          </div>
        </div>

        <div className="mc-card">
          <div className="mc-card-head"><div className="mc-card-head-title">Step 2 — Your Contact Information</div></div>
          <div className="mc-card-body">
            <div className="mc-row">
              <div className="mc-field">
                <label className="mc-label">First Name <span className="mc-req">*</span></label>
                <input className="mc-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </div>
              <div className="mc-field">
                <label className="mc-label">Last Name <span className="mc-req">*</span></label>
                <input className="mc-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" />
              </div>
            </div>
            <div className="mc-row">
              <div className="mc-field">
                <label className="mc-label">Email Address <span className="mc-req">*</span></label>
                <input className="mc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="email" />
              </div>
              <div className="mc-field">
                <label className="mc-label">Phone Number <span className="mc-req">*</span></label>
                <input className="mc-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(301) 555-0100" autoComplete="tel" />
              </div>
            </div>
            <div className="mc-field">
              <label className="mc-label">Property address(es) or description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="mc-input" rows={3} value={propertyDetails} onChange={(e) => setPropertyDetails(e.target.value)} placeholder="e.g. 1 SFH in Waldorf MD" style={{ resize: 'vertical', lineHeight: 1.5 }} />
              <div className="mc-hint">Helps us prepare your file — not required to proceed.</div>
            </div>
          </div>
        </div>

        <div className="mc-card">
          <div className="mc-card-head"><div className="mc-card-head-title">Step 3 — Secure Payment</div></div>
          <div className="mc-card-body">
            <div className="mc-pay-summary">
              <div className="mc-sum-eyebrow">Order Summary</div>
              <div className="mc-pay-row"><span>Setup Fee <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 600 }}>non-refundable</span></span><span>{rf(MEMBERSHIP_SETUP_FEE_CENTS)}</span></div>
              <div className="mc-pay-row"><span>Monthly Membership (first month)</span><span>{rf(MEMBERSHIP_MONTHLY_CENTS)}</span></div>
              <div className="mc-pay-row total"><span>Total Due Today</span><span>{rf(total)}</span></div>
            </div>

            <div className="mc-field">
              <label className="mc-label">Card Details <span className="mc-req">*</span></label>
              <div className="mc-stripe-card"><CardElement options={{ style: CARD_ELEMENT_STYLE }} /></div>
              <div className="mc-hint">Your card details are encrypted and never stored on our servers.</div>
            </div>

            {(fieldsError || submitTier.error) && <div className="mc-err">{fieldsError || submitTier.error}</div>}

            <button className="mc-btn-pay" type="button" onClick={onPay} disabled={submitTier.busy || !submitTier.stripeReady}>
              {submitTier.busy ? 'Processing…' : `Pay ${rf(total)} →`}
            </button>

            <div className="mc-secure"><span>🔒</span><span>256-bit SSL · Secured by Stripe · No card data stored</span></div>
          </div>
        </div>

        <p className="mc-foot">
          Questions? <a href="mailto:Info@rental911.net">Info@rental911.net</a> &nbsp;·&nbsp; <a href="https://rental911.net/landlord-services">View all services →</a><br />
          <a href="https://rental911.net/free-coaching-call">Not ready? Book a free coaching call first</a>
        </p>
      </div>
    </div>
  );
}
