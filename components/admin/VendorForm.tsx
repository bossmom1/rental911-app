'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { createVendor, updateVendor, type VendorFormInput } from '@/app/(admin)/admin/vendors/actions';
import type { Vendor } from '@/types/database';

const TRADES = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'general'];

const BLANK: VendorFormInput = {
  name: '',
  trade: '',
  phone: '',
  email: '',
  avg_response_hours: 24,
  license_number: '',
  license_expiry: '',
  license_status: 'pending',
  insurance_confirmed: false,
  insurance_confirmed_date: '',
  vetted_at: '',
  next_reverification_due: '',
  discount_offered: '',
  membership_start_date: '',
  membership_term_months: 12,
  membership_status: 'pending',
  ghl_contact_id: '',
};

function fromVendor(v: Vendor): VendorFormInput {
  return {
    name: v.name ?? '',
    trade: v.trade ?? '',
    phone: v.phone ?? '',
    email: v.email ?? '',
    avg_response_hours: v.avg_response_hours,
    license_number: v.license_number ?? '',
    license_expiry: v.license_expiry ?? '',
    license_status: v.license_status ?? 'pending',
    insurance_confirmed: v.insurance_confirmed,
    insurance_confirmed_date: v.insurance_confirmed_date ?? '',
    vetted_at: v.vetted_at ?? '',
    next_reverification_due: v.next_reverification_due ?? '',
    discount_offered: v.discount_offered ?? '',
    membership_start_date: v.membership_start_date ?? '',
    membership_term_months: v.membership_term_months,
    membership_status: v.membership_status ?? 'pending',
    ghl_contact_id: v.ghl_contact_id ?? '',
  };
}

export function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone?: () => void }) {
  const [form, setForm] = useState<VendorFormInput>(vendor ? fromVendor(vendor) : BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof VendorFormInput>(key: K, value: VendorFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = vendor ? await updateVendor(vendor.id, form) : await createVendor(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not save this vendor.');
      return;
    }
    if (!vendor) setForm(BLANK);
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="v_name">
          <Input id="v_name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="Trade" htmlFor="v_trade">
          <Select id="v_trade" value={form.trade} onChange={(e) => set('trade', e.target.value)} required>
            <option value="">Choose a trade…</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone" htmlFor="v_phone">
          <Input id="v_phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="v_email">
          <Input id="v_email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Avg response time (hours)" htmlFor="v_avg_hours">
          <Input
            id="v_avg_hours"
            type="number"
            min={1}
            value={form.avg_response_hours}
            onChange={(e) => set('avg_response_hours', Number(e.target.value))}
          />
        </Field>
        <Field label="GHL contact ID" htmlFor="v_ghl">
          <Input id="v_ghl" value={form.ghl_contact_id} onChange={(e) => set('ghl_contact_id', e.target.value)} />
        </Field>
      </div>

      <h3 className="mb-3 mt-2 font-display font-bold text-navy">Vetting &amp; compliance</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="License number" htmlFor="v_license_number">
          <Input id="v_license_number" value={form.license_number} onChange={(e) => set('license_number', e.target.value)} />
        </Field>
        <Field label="License status" htmlFor="v_license_status">
          <Select
            id="v_license_status"
            value={form.license_status}
            onChange={(e) => set('license_status', e.target.value as VendorFormInput['license_status'])}
          >
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="expired">expired</option>
          </Select>
        </Field>
        <Field label="License expiry" htmlFor="v_license_expiry">
          <Input id="v_license_expiry" type="date" value={form.license_expiry} onChange={(e) => set('license_expiry', e.target.value)} />
        </Field>
        <Field label="Vetted on" htmlFor="v_vetted_at">
          <Input id="v_vetted_at" type="date" value={form.vetted_at} onChange={(e) => set('vetted_at', e.target.value)} />
        </Field>
        <Field label="Next reverification due" htmlFor="v_reverify">
          <Input
            id="v_reverify"
            type="date"
            value={form.next_reverification_due}
            onChange={(e) => set('next_reverification_due', e.target.value)}
          />
        </Field>
        <Field label="Insurance confirmed date" htmlFor="v_ins_date">
          <Input
            id="v_ins_date"
            type="date"
            value={form.insurance_confirmed_date}
            onChange={(e) => set('insurance_confirmed_date', e.target.value)}
          />
        </Field>
      </div>
      <label className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.insurance_confirmed}
          onChange={(e) => set('insurance_confirmed', e.target.checked)}
        />
        <span className="text-ink">Insurance confirmed</span>
      </label>

      <h3 className="mb-3 mt-2 font-display font-bold text-navy">Membership</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Membership status" htmlFor="v_membership_status">
          <Select
            id="v_membership_status"
            value={form.membership_status}
            onChange={(e) => set('membership_status', e.target.value as VendorFormInput['membership_status'])}
          >
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="expired">expired</option>
          </Select>
        </Field>
        <Field label="Membership start date" htmlFor="v_membership_start">
          <Input
            id="v_membership_start"
            type="date"
            value={form.membership_start_date}
            onChange={(e) => set('membership_start_date', e.target.value)}
          />
        </Field>
        <Field label="Membership term (months)" htmlFor="v_membership_term">
          <Input
            id="v_membership_term"
            type="number"
            min={1}
            value={form.membership_term_months}
            onChange={(e) => set('membership_term_months', Number(e.target.value))}
          />
        </Field>
        <Field label="Discount offered" htmlFor="v_discount">
          <Input id="v_discount" value={form.discount_offered} onChange={(e) => set('discount_offered', e.target.value)} />
        </Field>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" variant="gold" disabled={busy}>
          {busy ? 'Saving…' : vendor ? 'Save changes' : 'Add vendor'}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
