'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import {
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  PLACEMENT_ONLY_PER_UNIT_CENTS,
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  ELITE_ADDON_SERVICES,
  type OnboardingTier,
  type OnboardingBillingOption,
  type PortfolioServiceModel,
} from '@/lib/landlord-onboarding-pricing';

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export interface OnboardingCheckoutPayload {
  tier: OnboardingTier;
  billingOption: OnboardingBillingOption | null;
  portfolioServiceModel: PortfolioServiceModel | null;
  totalUnits: number;
  eliteAddonServices: string[];
  activateNow: boolean;
}

/**
 * Pricing calculator + tier/billing/add-on selection UI — shared by the
 * authenticated onboarding wizard's Step 8 (`OnboardingFeeStep`) and the
 * public pre-signup checkout page. `onSubmit` does whatever's appropriate for
 * the caller (authenticated action vs. public action with contact fields
 * closed over); this component only owns the pricing inputs/display and the
 * busy/error state around calling it.
 */
export function OnboardingFeeCalculator({
  initialTotalUnits,
  initialTier,
  onSubmit,
}: {
  initialTotalUnits: number;
  initialTier?: OnboardingTier;
  onSubmit: (payload: OnboardingCheckoutPayload) => Promise<{ ok: boolean; error?: string; checkoutUrl?: string }>;
}) {
  const [tier, setTier] = useState<OnboardingTier>(initialTier ?? (initialTotalUnits >= 6 ? 'portfolio' : 'standard'));
  const [totalUnits, setTotalUnits] = useState(initialTotalUnits);
  const [billingOption, setBillingOption] = useState<OnboardingBillingOption>('monthly');
  const [portfolioServiceModel, setPortfolioServiceModel] = useState<PortfolioServiceModel>('rental911_portal');
  const [activateNow, setActivateNow] = useState(false);
  const [eliteAddons, setEliteAddons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStandard = tier === 'standard';
  const isPortfolio = tier === 'portfolio';
  const isPlacementOnly = tier === 'placement_only';
  const suggestPortfolio = totalUnits >= 6 && !isPortfolio;
  const suggestStandardOrPlacement = totalUnits < 6 && isPortfolio;

  const totals = useMemo(() => {
    const units = Math.max(1, totalUnits);
    const onboardingFeeCents = isPlacementOnly
      ? PLACEMENT_ONLY_PER_UNIT_CENTS * units
      : isStandard
        ? STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS * units
        : PORTFOLIO_AUDIT_PER_UNIT_CENTS * units;
    const isQuarterly = isStandard ? billingOption === 'quarterly' : portfolioServiceModel === 'external_system';
    const subUnitCents = isPlacementOnly
      ? 0
      : isStandard
        ? isQuarterly
          ? STANDARD_QUARTERLY_PER_UNIT_CENTS
          : STANDARD_MONTHLY_PER_UNIT_CENTS
        : isQuarterly
          ? PORTFOLIO_QUARTERLY_PER_UNIT_CENTS
          : PORTFOLIO_MONTHLY_PER_UNIT_CENTS;
    const subTotalCents = subUnitCents * units;
    const eliteTotalCents = eliteAddons.length * ELITE_ADDON_HOURLY_CENTS;
    const dueTodayCents =
      onboardingFeeCents + (!isPlacementOnly && activateNow ? subTotalCents : 0) + eliteTotalCents;
    return { onboardingFeeCents, subUnitCents, subTotalCents, eliteTotalCents, dueTodayCents, isQuarterly };
  }, [tier, totalUnits, billingOption, portfolioServiceModel, activateNow, eliteAddons, isStandard, isPlacementOnly]);

  function toggleElite(service: string) {
    setEliteAddons((prev) => (prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]));
  }

  async function onPay() {
    setBusy(true);
    setError(null);
    const result = await onSubmit({
      tier,
      billingOption: isPlacementOnly ? null : billingOption,
      portfolioServiceModel: isPortfolio ? portfolioServiceModel : null,
      totalUnits: Math.max(1, totalUnits),
      eliteAddonServices: eliteAddons,
      activateNow,
    });
    if (!result.ok || !result.checkoutUrl) {
      setError(result.error || 'Could not start checkout.');
      setBusy(false);
      return;
    }
    window.location.assign(result.checkoutUrl);
  }

  return (
    <div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total units">
          <Input
            type="number"
            min={1}
            value={totalUnits}
            onChange={(e) => setTotalUnits(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="Package">
          <Select value={tier} onChange={(e) => setTier(e.target.value as OnboardingTier)}>
            <option value="standard">Landlord Rescue (Standard)</option>
            <option value="placement_only">Placement Only — no subscription</option>
            <option value="portfolio">Portfolio Investor</option>
          </Select>
        </Field>
      </div>

      {suggestPortfolio && (
        <p className="mb-4 rounded-lg bg-warning-yellow/20 p-3 text-ink">
          With {totalUnits} units, the Portfolio Investor package may offer better pricing.
        </p>
      )}
      {suggestStandardOrPlacement && (
        <p className="mb-4 rounded-lg bg-warning-yellow/20 p-3 text-ink">
          Portfolio Investor requires 6+ units — with {totalUnits}, Landlord Rescue or Placement Only will apply.
        </p>
      )}

      {isStandard && (
        <Field label="Billing preference">
          <Select value={billingOption} onChange={(e) => setBillingOption(e.target.value as OnboardingBillingOption)}>
            <option value="monthly">Monthly — {fmt(STANDARD_MONTHLY_PER_UNIT_CENTS)}/unit</option>
            <option value="quarterly">Quarterly — {fmt(STANDARD_QUARTERLY_PER_UNIT_CENTS)}/unit</option>
          </Select>
        </Field>
      )}

      {isPortfolio && (
        <Field label="Billing preference">
          <Select
            value={portfolioServiceModel}
            onChange={(e) => setPortfolioServiceModel(e.target.value as PortfolioServiceModel)}
          >
            <option value="rental911_portal">
              Rental911 Portal — {fmt(PORTFOLIO_MONTHLY_PER_UNIT_CENTS)}/unit/mo (we collect rent)
            </option>
            <option value="external_system">
              External System — {fmt(PORTFOLIO_QUARTERLY_PER_UNIT_CENTS)}/unit/qtr (you collect rent, we oversee)
            </option>
          </Select>
        </Field>
      )}

      {!isPlacementOnly && (
        <div className="mb-4 rounded-lg border-2 border-navy bg-light-blue/20 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={activateNow}
              onChange={(e) => setActivateNow(e.target.checked)}
            />
            <span className="text-ink">
              <strong className="text-navy">Start my subscription today</strong> — your first subscription payment
              charges now and coverage begins immediately. Leave unchecked to be invoiced 30 days from today.
            </span>
          </label>
        </div>
      )}

      <div className="mb-4 rounded-lg border-2 border-warning-yellow/70 bg-warning-yellow/10 p-4">
        <p className="mb-2 font-display font-bold text-navy">
          Optional — Elite Asset Services ({fmt(ELITE_ADDON_HOURLY_CENTS)}/hr, 1-hr deposit per service)
        </p>
        <div className="flex flex-col gap-2">
          {ELITE_ADDON_SERVICES.map((service) => (
            <label key={service} className="flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                checked={eliteAddons.includes(service)}
                onChange={() => toggleElite(service)}
              />
              {service} <span className="font-semibold">+{fmt(ELITE_ADDON_HOURLY_CENTS)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-lg bg-light-blue/30 p-4">
        <p className="mb-2 font-display font-bold text-navy">Order summary</p>
        <div className="flex justify-between border-b border-black/10 py-1">
          <span>
            {isPlacementOnly ? 'Tenant Placement' : isStandard ? 'Tenant Placement Plus' : 'Portfolio Audit'} —{' '}
            {Math.max(1, totalUnits)} unit(s)
          </span>
          <span>{fmt(totals.onboardingFeeCents)}</span>
        </div>
        {!isPlacementOnly && (
          <div className="flex justify-between border-b border-black/10 py-1">
            <span>
              {totals.isQuarterly ? 'Quarterly' : 'Monthly'} subscription — {activateNow ? 'due today' : 'billed in 30 days'}
            </span>
            <span>{activateNow ? fmt(totals.subTotalCents) : '—'}</span>
          </div>
        )}
        {eliteAddons.length > 0 && (
          <div className="flex justify-between border-b border-black/10 py-1">
            <span>Elite Asset Services ({eliteAddons.length})</span>
            <span>{fmt(totals.eliteTotalCents)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 font-display font-bold text-navy">
          <span>Total due today</span>
          <span>{fmt(totals.dueTodayCents)}</span>
        </div>
      </div>

      <Button disabled={busy} onClick={onPay} variant="gold">
        {busy ? 'Starting checkout…' : `Pay ${fmt(totals.dueTodayCents)} & Continue`}
      </Button>
    </div>
  );
}
