'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { addProperty, addUnit, addTenant } from '@/app/(landlord)/landlord/(portal)/actions';

const MD_COUNTIES = ['Charles', "St. Mary's", 'Prince George’s', 'Calvert', 'Anne Arundel', 'Other'];

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function submit(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }
  return { error, open, setOpen, pending, submit };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>;
}

export function AddPropertyForm() {
  const { error, open, setOpen, pending, submit } = useAction();
  if (!open) {
    return <Button variant="gold" onClick={() => setOpen(true)}>+ Add property</Button>;
  }
  return (
    <form
      action={(fd) => submit(() => addProperty(fd))}
      className="rounded-xl border border-light-blue bg-white p-6"
    >
      <ErrorNote error={error} />
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Property name" htmlFor="p_name">
          <Input id="p_name" name="name" required />
        </Field>
        <Field label="Type" htmlFor="p_type">
          <Select id="p_type" name="property_type" defaultValue="single_family">
            <option value="single_family">Single family</option>
            <option value="multi_unit">Multi-unit</option>
            <option value="condo">Condo</option>
            <option value="townhouse">Townhouse</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address" htmlFor="p_addr">
            <Input id="p_addr" name="address" required />
          </Field>
        </div>
        <Field label="City" htmlFor="p_city">
          <Input id="p_city" name="city" required />
        </Field>
        <Field label="ZIP" htmlFor="p_zip">
          <Input id="p_zip" name="zip" required />
        </Field>
        <Field label="County" htmlFor="p_county">
          <Select id="p_county" name="county" defaultValue="Charles">
            {MD_COUNTIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Units" htmlFor="p_units">
          <Input id="p_units" name="unit_count" type="number" min={1} defaultValue={1} />
        </Field>
        <label className="mb-4 flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="lead_paint_required" className="h-5 w-5" />
          <span className="text-ink">Pre-1978 — lead paint certificate required</span>
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save property'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function AddUnitForm({ propertyId }: { propertyId: string }) {
  const { error, open, setOpen, pending, submit } = useAction();
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-display font-bold text-navy underline"
      >
        + Add unit
      </button>
    );
  }
  return (
    <form
      action={(fd) => submit(() => addUnit(fd))}
      className="mt-3 rounded-lg border border-light-blue bg-light-blue/10 p-4"
    >
      <ErrorNote error={error} />
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
        <Field label="Unit #" htmlFor={`u_num_${propertyId}`}>
          <Input id={`u_num_${propertyId}`} name="unit_number" defaultValue="1" />
        </Field>
        <Field label="Rent ($)" htmlFor={`u_rent_${propertyId}`}>
          <Input id={`u_rent_${propertyId}`} name="monthly_rent" type="number" min={0} required />
        </Field>
        <Field label="Beds" htmlFor={`u_bed_${propertyId}`}>
          <Input id={`u_bed_${propertyId}`} name="bedrooms" type="number" min={0} defaultValue={2} />
        </Field>
        <Field label="Baths" htmlFor={`u_bath_${propertyId}`}>
          <Input id={`u_bath_${propertyId}`} name="bathrooms" type="number" min={0} step="0.5" defaultValue={1} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add unit'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function AddTenantForm({
  units,
}: {
  units: Array<{ id: string; label: string }>;
}) {
  const { error, open, setOpen, pending, submit } = useAction();
  if (!open) {
    return (
      <Button variant="gold" onClick={() => setOpen(true)} >
        + Add tenant
      </Button>
    );
  }
  return (
    <form
      action={(fd) => submit(() => addTenant(fd))}
      className="rounded-xl border border-light-blue bg-white p-6"
    >
      <ErrorNote error={error} />
      {units.length === 0 ? (
        <p className="mb-3 text-ink">
          Add a property and unit first, then you can assign a tenant.
        </p>
      ) : (
        <>
          <Field label="Assign to unit" htmlFor="t_unit">
            <Select id="t_unit" name="unit_id" required>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Full name" htmlFor="t_name">
            <Input id="t_name" name="full_name" required />
          </Field>
          <Field label="Email" htmlFor="t_email">
            <Input id="t_email" name="email" type="email" required />
          </Field>
          <Field label="Phone" htmlFor="t_phone">
            <Input id="t_phone" name="phone" type="tel" />
          </Field>
        </>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || units.length === 0}>
          {pending ? 'Adding…' : 'Add tenant'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
