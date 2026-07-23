'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VendorActiveToggle } from '@/components/admin/VendorActiveToggle';
import { VendorForm } from '@/components/admin/VendorForm';
import { fmtDate } from '@/lib/format';
import { isVendorLapsed } from '@/lib/vendors';
import type { Vendor } from '@/types/database';

export function VendorRow({
  vendor,
  stats,
}: {
  vendor: Vendor;
  stats: { jobsDispatched: number; completionRate: number | null; avgRating: number | null; ratingCount: number };
}) {
  const [editing, setEditing] = useState(false);
  const lapsed = isVendorLapsed(vendor);

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="bg-light-blue/10 px-4 py-4">
          <VendorForm vendor={vendor} onDone={() => setEditing(false)} />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-display font-bold text-navy">{vendor.name || '—'}</p>
        <p className="text-ink/60">{vendor.phone}</p>
        <p className="text-ink/60">{vendor.email}</p>
      </td>
      <td className="px-4 py-3 capitalize">{vendor.trade || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge value={vendor.license_status} />
          {lapsed && <Badge value="no_response" />}
        </div>
        {vendor.next_reverification_due && (
          <p className="mt-1 text-ink/60">Reverify by {fmtDate(vendor.next_reverification_due)}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge value={vendor.membership_status} />
      </td>
      <td className="px-4 py-3">{vendor.avg_response_hours}h</td>
      <td className="px-4 py-3">
        <p>{stats.jobsDispatched} dispatched</p>
        <p className="text-ink/60">
          {stats.completionRate != null ? `${Math.round(stats.completionRate * 100)}% completed` : '—'}
        </p>
        <p className="text-ink/60">
          {stats.ratingCount >= 3 && stats.avgRating != null
            ? `${stats.avgRating.toFixed(1)}★ (${stats.ratingCount})`
            : stats.ratingCount > 0
              ? `${stats.ratingCount} rating${stats.ratingCount === 1 ? '' : 's'} so far`
              : 'No ratings yet'}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-2">
          <VendorActiveToggle vendorId={vendor.id} active={vendor.active} />
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </td>
    </tr>
  );
}
