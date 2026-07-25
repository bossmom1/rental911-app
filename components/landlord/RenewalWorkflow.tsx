'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { fmtMoney } from '@/lib/format';
import type { LeaseRenewal, MoveOutChecklist } from '@/types/database';
import {
  startRenewalDraft,
  approveRenewalDraft,
  markRenewalSigned,
  setMonthToMonth,
  beginTurnover,
  updateMoveOutChecklist,
} from '@/app/(landlord)/landlord/(portal)/tenants/[leaseId]/actions';

type Mode = 'menu' | 'renew' | 'month_to_month' | 'turnover';

export function RenewalWorkflow({
  leaseId,
  tenantId,
  isMonthToMonth,
  renewal,
  moveOutChecklist,
}: {
  leaseId: string;
  tenantId: string;
  isMonthToMonth: boolean;
  renewal: LeaseRenewal | null;
  moveOutChecklist: MoveOutChecklist | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Something went wrong.');
      return;
    }
    router.refresh();
  }

  // A renewal already in progress (or completed) — show its state instead of the menu.
  if (renewal) {
    return (
      <Card>
        <CardHeader title="Renewal" subtitle={`Status: ${renewal.status?.replace(/_/g, ' ')}`} />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {renewal.status === 'draft_review' && (
          <div className="space-y-3">
            <p className="text-ink/70">
              New end date {renewal.new_end_date} at {fmtMoney(renewal.new_monthly_rent)}/mo.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`/api/lease-renewals/${renewal.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border-2 border-navy px-4 py-2.5 font-display font-bold text-navy hover:bg-light-blue/30"
              >
                Preview / Download PDF
              </a>
              <Button
                disabled={busy}
                onClick={() => run(() => approveRenewalDraft(renewal.id, leaseId))}
              >
                Approve &amp; Send to Tenant
              </Button>
            </div>
          </div>
        )}

        {renewal.status === 'sent_to_tenant' && (
          <div className="space-y-3">
            <p className="text-ink/70">
              Lease emailed to the tenant to sign outside the app. Once they&apos;ve signed, upload
              the signed copy and mark it complete.
            </p>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block text-ink"
            />
            <Button
              disabled={busy || !uploadFile}
              onClick={() =>
                run(async () => {
                  if (!uploadFile) return { ok: false, error: 'Choose the signed lease file.' };
                  const supabase = createSupabaseBrowserClient();
                  const path = `${tenantId}/${leaseId}/${Date.now()}-${uploadFile.name}`;
                  const { error: upErr } = await supabase.storage
                    .from('documents')
                    .upload(path, uploadFile, { upsert: false });
                  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
                  const fileUrl = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;
                  return markRenewalSigned(renewal.id, leaseId, {
                    file_name: uploadFile.name,
                    file_url: fileUrl,
                  });
                })
              }
            >
              Mark as Signed
            </Button>
          </div>
        )}

        {renewal.status === 'signed' && (
          <p className="text-ink">
            Renewal complete — the new lease is active and the signed copy is on file.
          </p>
        )}
      </Card>
    );
  }

  if (isMonthToMonth) {
    return (
      <Card>
        <CardHeader title="Month-to-Month" />
        <p className="text-ink">This lease is on a month-to-month basis.</p>
      </Card>
    );
  }

  if (moveOutChecklist) {
    const fields: { key: keyof MoveOutChecklist; label: string }[] = [
      { key: 'keys_returned', label: 'Keys returned' },
      { key: 'walkthrough_completed', label: 'Move-out walkthrough completed' },
      { key: 'deposit_disposition_sent', label: 'Deposit disposition sent' },
      { key: 'unit_ready_for_relist', label: 'Unit ready for relist' },
    ];
    return (
      <Card>
        <CardHeader
          title="Move-Out Checklist"
          subtitle={moveOutChecklist.completed_at ? 'Complete' : 'In progress'}
        />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <form
          className="space-y-2"
          onChange={(e) => {
            const form = e.currentTarget;
            const data = new FormData(form);
            run(() => updateMoveOutChecklist(moveOutChecklist.id, leaseId, data));
          }}
        >
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                name={f.key}
                defaultChecked={Boolean(moveOutChecklist[f.key])}
              />
              {f.label}
            </label>
          ))}
        </form>
      </Card>
    );
  }

  if (mode === 'renew') {
    return (
      <Card>
        <CardHeader title="Renew Lease" />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() => startRenewalDraft(leaseId, data));
          }}
        >
          <Field label="New end date" htmlFor="new_end_date">
            <Input id="new_end_date" name="new_end_date" type="date" required />
          </Field>
          <Field label="New monthly rent" htmlFor="new_monthly_rent">
            <Input id="new_monthly_rent" name="new_monthly_rent" type="number" min="0" step="0.01" required />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              Create Draft
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('menu')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  if (mode === 'month_to_month') {
    return (
      <Card>
        <CardHeader title="Go Month-to-Month" />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() => setMonthToMonth(leaseId, data));
          }}
        >
          <Field label="Note (optional)" htmlFor="note">
            <Textarea id="note" name="note" rows={3} />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              Confirm Month-to-Month
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('menu')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  if (mode === 'turnover') {
    return (
      <Card>
        <CardHeader title="Begin Turnover" />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <p className="mb-4 text-ink/70">
          This ends the lease, marks the unit vacant, and opens a move-out checklist.
        </p>
        <div className="flex gap-3">
          <Button variant="danger" disabled={busy} onClick={() => run(() => beginTurnover(leaseId))}>
            Confirm Turnover
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('menu')}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Lease ending — what's next?" />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setMode('renew')}>Renew</Button>
        <Button variant="outline" onClick={() => setMode('month_to_month')}>
          Month-to-Month
        </Button>
        <Button variant="danger" onClick={() => setMode('turnover')}>
          Begin Turnover
        </Button>
      </div>
    </Card>
  );
}
