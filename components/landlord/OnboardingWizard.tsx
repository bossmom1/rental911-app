'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import {
  saveProperty,
  saveUnit,
  saveTenant,
  recordDocuments,
  advanceStep,
  completeOnboarding,
} from '@/app/(landlord)/landlord/onboarding/actions';

const STEPS = [
  'Create account',
  'Add property',
  'Unit details',
  'Add tenant',
  'Documents',
  'Bank payouts',
  'Preview portal',
  'Confirmation call',
];

const MD_COUNTIES = [
  'Charles',
  "St. Mary's",
  'Prince George’s',
  'Calvert',
  'Anne Arundel',
  'Other',
];

const GHL_EMBED = process.env.NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED || '';

export function OnboardingWizard({
  initialStep,
  landlordId,
  email,
}: {
  initialStep: number;
  landlordId: string;
  email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), 8));
  const [error, setError] = useState<string | null>(null);
  // Separate from `pending`: the Stripe hop is a plain fetch + full navigation,
  // not a server action, so useTransition never sees it.
  const [connecting, setConnecting] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; step?: number; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error || 'Something went wrong.');
        return;
      }
      if (res.step) setStep(res.step);
      router.refresh();
    });
  }

  function finish(booked: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding(booked);
      if (!res.ok) {
        setError(res.error || 'Something went wrong.');
        return;
      }
      router.replace('/landlord/dashboard');
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-light-blue/20 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo href="#" />
          <p className="font-display font-bold text-navy">
            Step {step} of 8
          </p>
        </div>

        {/* Stepper */}
        <ol className="mb-8 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state =
              n < step ? 'done' : n === step ? 'current' : 'todo';
            return (
              <li key={label} className="text-center">
                <div
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full font-display font-bold ${
                    state === 'done'
                      ? 'bg-gold text-navy'
                      : state === 'current'
                        ? 'bg-navy text-white'
                        : 'bg-white text-ink/50 border border-light-blue'
                  }`}
                >
                  {state === 'done' ? '✓' : n}
                </div>
                <p className="mt-1 hidden text-ink/70 sm:block">{label}</p>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-light-blue bg-white p-6 shadow-md sm:p-8">
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">
              {error}
            </p>
          )}

          {step === 1 && (
            <StepShell
              title="Account created"
              subtitle="Your account is confirmed. Let’s set up your first property."
            >
              <p className="mb-6 text-ink">
                Signed in as <strong>{email}</strong>.
              </p>
              <Button
                disabled={pending}
                onClick={() => run(() => advanceStep(2))}
              >
                Continue
              </Button>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              title="Add your first property"
              subtitle="Address, county, and how many units it has."
            >
              <form
                action={(fd) => run(() => saveProperty(fd))}
                className="grid grid-cols-1 gap-x-4 sm:grid-cols-2"
              >
                <Field label="Property name" htmlFor="name">
                  <Input id="name" name="name" required placeholder="Maple Court" />
                </Field>
                <Field label="Property type" htmlFor="property_type">
                  <Select id="property_type" name="property_type" defaultValue="single_family">
                    <option value="single_family">Single family</option>
                    <option value="multi_unit">Multi-unit</option>
                    <option value="condo">Condo</option>
                    <option value="townhouse">Townhouse</option>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Street address" htmlFor="address">
                    <Input id="address" name="address" required />
                  </Field>
                </div>
                <Field label="City" htmlFor="city">
                  <Input id="city" name="city" required />
                </Field>
                <Field label="ZIP" htmlFor="zip">
                  <Input id="zip" name="zip" required />
                </Field>
                <Field label="County" htmlFor="county">
                  <Select id="county" name="county" defaultValue="Charles">
                    {MD_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Number of units" htmlFor="unit_count">
                  <Input
                    id="unit_count"
                    name="unit_count"
                    type="number"
                    min={1}
                    defaultValue={1}
                  />
                </Field>
                <label className="mb-4 flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" name="lead_paint_required" className="h-5 w-5" />
                  <span className="text-ink">
                    Built before 1978 — Maryland lead paint certificate required
                  </span>
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save property & continue'}
                  </Button>
                </div>
              </form>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              title="Unit details"
              subtitle="Rent amount, bedrooms, and size for the first unit."
            >
              <form
                action={(fd) => run(() => saveUnit(fd))}
                className="grid grid-cols-1 gap-x-4 sm:grid-cols-2"
              >
                <Field label="Unit number / label" htmlFor="unit_number">
                  <Input id="unit_number" name="unit_number" defaultValue="1" />
                </Field>
                <Field label="Monthly rent ($)" htmlFor="monthly_rent">
                  <Input
                    id="monthly_rent"
                    name="monthly_rent"
                    type="number"
                    min={0}
                    required
                    placeholder="1800"
                  />
                </Field>
                <Field label="Bedrooms" htmlFor="bedrooms">
                  <Input id="bedrooms" name="bedrooms" type="number" min={0} defaultValue={2} />
                </Field>
                <Field label="Bathrooms" htmlFor="bathrooms">
                  <Input id="bathrooms" name="bathrooms" type="number" min={0} step="0.5" defaultValue={1} />
                </Field>
                <Field label="Square feet (optional)" htmlFor="sqft">
                  <Input id="sqft" name="sqft" type="number" min={0} />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save unit & continue'}
                  </Button>
                </div>
              </form>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              title="Add your tenant"
              subtitle="We’ll email them an invite to set up their tenant portal."
            >
              <form action={(fd) => run(() => saveTenant(fd))}>
                <Field label="Tenant full name" htmlFor="full_name">
                  <Input id="full_name" name="full_name" required />
                </Field>
                <Field label="Tenant email" htmlFor="temail">
                  <Input id="temail" name="email" type="email" required />
                </Field>
                <Field label="Tenant phone" htmlFor="tphone">
                  <Input id="tphone" name="phone" type="tel" />
                </Field>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Adding tenant…' : 'Add tenant & continue'}
                </Button>
              </form>
            </StepShell>
          )}

          {step === 5 && (
            <DocumentsStep
              landlordId={landlordId}
              pending={pending}
              onError={setError}
              onSubmit={(docs) => run(() => recordDocuments(docs))}
            />
          )}

          {step === 6 && (
            <StepShell
              title="Set up bank payouts"
              subtitle="Connect your bank with Stripe to receive rent payouts."
            >
              <div className="mb-6 rounded-lg bg-light-blue/30 p-4 text-ink">
                <p className="font-display font-bold text-navy">
                  Stripe Connect Express
                </p>
                <p className="mt-1">
                  Stripe collects your bank and identity details directly — Rental911
                  never sees them. Tenants cannot pay rent until this is finished,
                  but you can connect later and continue onboarding now.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="gold"
                  disabled={pending || connecting}
                  onClick={async () => {
                    setError(null);
                    setConnecting(true);
                    try {
                      const res = await fetch('/api/stripe/connect', { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok || !data.ok) {
                        setError(data.error ?? 'Could not start Stripe onboarding.');
                        setConnecting(false);
                        return;
                      }
                      // Stripe-hosted flow; returns to /landlord/onboarding.
                      window.location.assign(data.url);
                    } catch {
                      setError('Could not reach Stripe. Please try again.');
                      setConnecting(false);
                    }
                  }}
                >
                  {connecting ? 'Opening Stripe…' : 'Connect bank with Stripe'}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || connecting}
                  onClick={() => run(() => advanceStep(7))}
                >
                  Skip for now
                </Button>
              </div>
            </StepShell>
          )}

          {step === 7 && (
            <StepShell
              title="Preview your tenant portal"
              subtitle="Here’s what your tenants will see when they log in."
            >
              <div className="mb-6 overflow-hidden rounded-xl border border-light-blue">
                <div className="bg-navy p-4 text-white">
                  <p className="font-display text-lg font-bold">Tenant Dashboard</p>
                  <p className="opacity-90">Unit &amp; lease summary</p>
                </div>
                <ul className="divide-y divide-light-blue/40">
                  {[
                    'Pay rent (ACH or card)',
                    'Submit a maintenance request',
                    'Message about open requests',
                    'View lease & documents',
                  ].map((f) => (
                    <li key={f} className="px-4 py-3 text-ink">
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
              <Button disabled={pending} onClick={() => run(() => advanceStep(8))}>
                Looks good — continue
              </Button>
            </StepShell>
          )}

          {step === 8 && (
            <StepShell
              title="Schedule your confirmation call with Christine"
              subtitle="Required to unlock full access. Book a time below."
            >
              {GHL_EMBED ? (
                <iframe
                  src={GHL_EMBED}
                  title="Book your onboarding call"
                  className="mb-6 h-[600px] w-full rounded-xl border border-light-blue"
                />
              ) : (
                <div className="mb-6 rounded-lg bg-warning-yellow/20 p-4 text-ink">
                  <p className="font-display font-bold text-navy">
                    Calendar not configured
                  </p>
                  <p className="mt-1">
                    Set <code>NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED</code> in
                    your environment to Christine’s GHL booking widget URL. The
                    booking iframe will render here.
                  </p>
                </div>
              )}

              <div className="rounded-lg bg-light-blue/30 p-4">
                <p className="text-ink">
                  After you book, click <strong>“I’ve booked my call.”</strong>{' '}
                  Your portal opens in <strong>limited access</strong> until
                  Christine confirms the call and unlocks full access.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button disabled={pending} onClick={() => finish(true)}>
                  {pending ? 'Finishing…' : 'I’ve booked my call'}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => finish(false)}
                >
                  Skip for now (limited access)
                </Button>
              </div>
            </StepShell>
          )}
        </div>
      </div>
    </main>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">{title}</h1>
      {subtitle && <p className="mb-6 mt-1 text-ink/70">{subtitle}</p>}
      {children}
    </div>
  );
}

function DocumentsStep({
  landlordId,
  pending,
  onError,
  onSubmit,
}: {
  landlordId: string;
  pending: boolean;
  onError: (msg: string | null) => void;
  onSubmit: (
    docs: Array<{ type: string; file_name: string; file_url: string }>
  ) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    setUploading(true);
    const form = e.currentTarget;
    const docs: Array<{ type: string; file_name: string; file_url: string }> = [];
    const supabase = createSupabaseBrowserClient();

    const entries: Array<[string, HTMLInputElement | null]> = [
      ['lead_paint', form.querySelector<HTMLInputElement>('#lead_paint')],
      ['rental_license', form.querySelector<HTMLInputElement>('#rental_license')],
    ];

    for (const [type, input] of entries) {
      const file = input?.files?.[0];
      if (!file) continue;
      const path = `${landlordId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: false });
      if (error) {
        // Bucket may not exist yet — record the name so it can be re-uploaded later.
        docs.push({ type, file_name: file.name, file_url: '' });
        continue;
      }
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      docs.push({ type, file_name: file.name, file_url: data.publicUrl });
    }

    setUploading(false);
    onSubmit(docs);
  }

  return (
    <StepShell
      title="Upload required documents"
      subtitle="Lead paint certificate (pre-1978 units) and rental license."
    >
      <form onSubmit={handle}>
        <Field label="Lead paint certificate" htmlFor="lead_paint">
          <input id="lead_paint" type="file" accept=".pdf,.jpg,.jpeg,.png" className="block w-full text-ink" />
        </Field>
        <Field label="Rental license" htmlFor="rental_license">
          <input id="rental_license" type="file" accept=".pdf,.jpg,.jpeg,.png" className="block w-full text-ink" />
        </Field>
        <p className="mb-4 text-ink/60">
          You can skip and upload later — this step still completes.
        </p>
        <Button type="submit" disabled={pending || uploading}>
          {uploading ? 'Uploading…' : pending ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </StepShell>
  );
}
