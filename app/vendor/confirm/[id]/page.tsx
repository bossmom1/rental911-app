import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { VendorConfirmForm } from '@/components/vendor/VendorConfirmForm';

export const dynamic = 'force-dynamic';

/**
 * Public, unauthenticated page a vendor reaches via the link in their
 * dispatch notification (SMS/email). No login — the dispatch id is the token.
 */
export default async function VendorConfirmPage({ params }: { params: { id: string } }) {
  const admin = createSupabaseAdminClient();
  const { data: dispatch } = await admin
    .from('vendor_dispatches')
    .select(
      `id, scheduled_date, vendor_response, tenant_availability,
       vendor:vendors(name, trade),
       request:maintenance_requests(title, description, category, priority,
         unit:units(unit_number, property:properties(address, city, state, zip)))`
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!dispatch) notFound();

  const vendor = (dispatch as any).vendor;
  const req = (dispatch as any).request;
  const unit = req?.unit;
  const property = unit?.property;
  const address = [property?.address, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.city, property?.state, property?.zip]
    .filter(Boolean)
    .join(', ');

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-light-blue/10 px-4 py-10">
      <Logo href="/" />
      <div className="mt-6 rounded-2xl border border-light-blue bg-white p-8 shadow-md">
        <h1 className="font-display text-2xl font-bold text-navy">
          {vendor?.name ? `Hi ${vendor.name},` : 'Job details'}
        </h1>
        <p className="mt-1 text-ink/70">
          You&apos;ve been notified about a maintenance job. Confirm the scheduled date/time once you&apos;ve
          coordinated — this isn&apos;t an accept/decline, just a scheduling confirmation.
        </p>

        <div className="mt-6 space-y-3 rounded-xl bg-light-blue/20 p-4">
          <div>
            <p className="font-display font-bold text-navy">{req?.title || 'Maintenance request'}</p>
            <p className="text-ink/70">{req?.description || 'No description provided.'}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink">
            <span><strong>Address:</strong> {address || '—'}</span>
            <span className="capitalize"><strong>Category:</strong> {req?.category || '—'}</span>
            <span className="capitalize"><strong>Priority:</strong> {req?.priority || '—'}</span>
          </div>
          {dispatch.tenant_availability && (
            <p className="text-ink">
              <strong>Tenant&apos;s stated availability:</strong> {dispatch.tenant_availability}
            </p>
          )}
        </div>

        {dispatch.vendor_response === 'confirmed' && dispatch.scheduled_date ? (
          <p className="mt-6 rounded-lg bg-green-50 px-4 py-3 text-green-800">
            Already confirmed for <strong>{dispatch.scheduled_date}</strong>. Need to change it? Just resubmit below.
          </p>
        ) : null}

        <div className="mt-6">
          <VendorConfirmForm dispatchId={dispatch.id} />
        </div>
      </div>
    </main>
  );
}
