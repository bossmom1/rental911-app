'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { generateMembershipInvoice } from '@/app/(admin)/admin/vendors/[vendorId]/actions';

/**
 * Checkout URLs expire ~24h after creation, so the raw link is only ever
 * shown right after generation (this component's own state) — never
 * reconstructed from a stored session id after a page reload.
 */
export function GenerateMembershipInvoiceButton({ vendorId }: { vendorId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setCheckoutUrl(null);
    setCopied(false);
    const result = await generateMembershipInvoice(vendorId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not generate invoice.');
      return;
    }
    setCheckoutUrl(result.checkoutUrl ?? null);
    router.refresh();
  }

  async function onCopy() {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <Button type="button" variant="gold" onClick={onGenerate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate Membership Invoice'}
      </Button>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {checkoutUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-light-blue/60 bg-light-blue/10 px-3 py-2">
          <input
            readOnly
            value={checkoutUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-ink/80 outline-none"
          />
          <Button type="button" variant="outline" onClick={onCopy}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>
      )}
    </div>
  );
}
