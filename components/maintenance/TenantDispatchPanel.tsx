'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/format';
import { selfDispatchVendor, confirmScheduledDateAsTenant } from '@/app/(tenant)/tenant/maintenance/actions';
import type { VendorDispatch } from '@/types/database';

interface VendorOption {
  id: string;
  name: string | null;
  trade: string | null;
  avg_response_hours: number;
}

export function TenantDispatchPanel({
  requestId,
  priority,
  vendors,
  dispatches,
}: {
  requestId: string;
  priority: string | null;
  vendors: VendorOption[];
  dispatches: (VendorDispatch & { vendor: { name: string | null; phone: string | null; trade: string | null } | null })[];
}) {
  if (priority === 'emergency') {
    return (
      <Card className="mt-6">
        <CardHeader title="Vendor" />
        <p className="text-ink/70">
          Emergency requests are routed directly to the Rental911 team for dispatch — no self-service needed here.
        </p>
      </Card>
    );
  }

  const activeDispatch = dispatches[0] ?? null;

  return (
    <Card className="mt-6">
      <CardHeader title="Vendor" subtitle={activeDispatch ? undefined : 'Request a vendor from our network directly.'} />
      {activeDispatch ? (
        <ExistingDispatch dispatch={activeDispatch} />
      ) : (
        <RequestVendorForm requestId={requestId} vendors={vendors} />
      )}
    </Card>
  );
}

function ExistingDispatch({
  dispatch,
}: {
  dispatch: VendorDispatch & { vendor: { name: string | null; phone: string | null; trade: string | null } | null };
}) {
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError('Pick a date.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await confirmScheduledDateAsTenant(dispatch.id, date);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not save.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-navy">{dispatch.vendor?.name || 'Vendor'}</p>
          <p className="text-ink/70">{dispatch.vendor?.phone}</p>
        </div>
        <Badge value={dispatch.vendor_response} />
      </div>
      {dispatch.scheduled_date ? (
        <p className="rounded-lg bg-light-blue/20 px-3 py-2 text-ink">
          Scheduled for <strong>{fmtDate(dispatch.scheduled_date)}</strong>
          {dispatch.confirmed_by ? ` (confirmed by ${dispatch.confirmed_by})` : ''}
        </p>
      ) : (
        <>
          <p className="text-ink/70">
            {dispatch.vendor?.name || 'The vendor'} will text you directly to agree on a time. Once you&apos;ve agreed,
            log it here.
          </p>
          {!showConfirmForm ? (
            <Button type="button" variant="outline" onClick={() => setShowConfirmForm(true)}>
              Log confirmed date
            </Button>
          ) : (
            <form onSubmit={onConfirm} className="flex flex-wrap items-end gap-3">
              <Field label="Scheduled date" htmlFor="tenant_confirm_date">
                <Input
                  id="tenant_confirm_date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="gold" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </form>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </>
      )}
    </div>
  );
}

function RequestVendorForm({ requestId, vendors }: { requestId: string; vendors: VendorOption[] }) {
  const [vendorId, setVendorId] = useState('');
  const [availability, setAvailability] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) {
      setError('Choose a vendor.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await selfDispatchVendor(requestId, vendorId, availability);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not request this vendor.');
      return;
    }
    router.refresh();
  }

  if (vendors.length === 0) {
    return <p className="text-ink/70">No vendors are available for this category yet — Rental911 will follow up.</p>;
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Vendor" htmlFor="vendor_select">
        <Select id="vendor_select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Choose a vendor…</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — avg response {v.avg_response_hours}h
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your availability" htmlFor="availability" hint="Days/times you're generally free — the vendor will text you to lock in a specific slot.">
        <Textarea
          id="availability"
          rows={2}
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          placeholder="Weekdays after 4pm, or Saturday mornings"
        />
      </Field>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <Button type="submit" variant="gold" disabled={busy}>
        {busy ? 'Requesting…' : 'Request This Vendor'}
      </Button>
    </form>
  );
}
