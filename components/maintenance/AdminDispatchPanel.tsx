'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { adminDispatchVendor } from '@/app/(admin)/admin/maintenance/actions';
import type { VendorDispatch } from '@/types/database';

interface VendorOption {
  id: string;
  name: string | null;
  trade: string | null;
  avg_response_hours: number;
}

export function AdminDispatchPanel({
  requestId,
  vendors,
  dispatches,
}: {
  requestId: string;
  vendors: VendorOption[];
  dispatches: (VendorDispatch & { vendor: { name: string | null; phone: string | null } | null; overdue: boolean })[];
}) {
  return (
    <Card className="mt-6">
      <CardHeader title="Vendor dispatch" />
      {dispatches.length > 0 && (
        <div className="mb-4 space-y-2">
          {dispatches.map((d) => (
            <div key={d.id} className="rounded-lg border border-light-blue/60 p-3">
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-navy">{d.vendor?.name || 'Vendor'}</p>
                <div className="flex items-center gap-2">
                  {d.overdue && <Badge value="no_response" />}
                  <Badge value={d.vendor_response} />
                </div>
              </div>
              <p className="text-ink/70">
                Dispatched {fmtDateTime(d.dispatched_at)} · {d.dispatch_type === 'tenant' ? 'tenant self-dispatch' : 'admin dispatch'}
              </p>
              {d.scheduled_date && (
                <p className="text-ink">
                  Scheduled for <strong>{fmtDate(d.scheduled_date)}</strong>
                  {d.confirmed_by ? ` (confirmed by ${d.confirmed_by})` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <DispatchForm requestId={requestId} vendors={vendors} />
    </Card>
  );
}

function DispatchForm({ requestId, vendors }: { requestId: string; vendors: VendorOption[] }) {
  const [vendorId, setVendorId] = useState('');
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
    const result = await adminDispatchVendor(requestId, vendorId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not dispatch this vendor.');
      return;
    }
    setVendorId('');
    router.refresh();
  }

  if (vendors.length === 0) {
    return <p className="text-ink/70">No active vendors on file yet — add one on the Vendors page.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
        <Field label="Dispatch a vendor" htmlFor="admin_vendor_select">
          <Select id="admin_vendor_select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Choose a vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.trade} — avg response {v.avg_response_hours}h
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="gold" disabled={busy}>
        {busy ? 'Dispatching…' : 'Dispatch Vendor'}
      </Button>
      {error && <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
    </form>
  );
}
