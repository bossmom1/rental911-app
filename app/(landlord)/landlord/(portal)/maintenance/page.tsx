import { cookies } from 'next/headers';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestList } from '@/components/maintenance/RequestList';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/format';
import { approveMaintenanceAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function LandlordMaintenance() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: allRequests } = await supabase
    .from('maintenance_requests')
    .select('id, title, category, priority, status, created_at, billing_amount_cents')
    .eq('landlord_id', current!.authId)
    .order('created_at', { ascending: false });

  const pending = (allRequests ?? []).filter((r) => r.status === 'pending_approval');
  const active = (allRequests ?? []).filter((r) => r.status !== 'pending_approval');

  return (
    <>
      <RealtimeRefresher
        table="maintenance_requests"
        filter={`landlord_id=eq.${current!.authId}`}
        channelKey={`maint-list-landlord-${current!.authId}`}
      />
      <PageHeader
        title="Maintenance"
        subtitle="Requests submitted by your tenants."
      />

      {/* Pending Approval section — only shown when at least one request needs approval */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-bold text-navy text-lg mb-3 flex items-center gap-2">
            Pending Your Approval
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gold text-white text-xs font-bold">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-3">
            {pending.map((req) => {
              const costFormatted = req.billing_amount_cents
                ? `$${(req.billing_amount_cents / 100).toFixed(0)}`
                : null;
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gold/40 bg-gold/5 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-display font-bold text-navy truncate">
                      {req.title || 'Untitled'}
                    </p>
                    <p className="text-sm text-ink/60 capitalize">
                      {req.category || '—'} · {fmtDate(req.created_at)}
                      {costFormatted && (
                        <span className="ml-2 font-medium text-ink">
                          Est. {costFormatted}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge value="pending_approval" />
                    <Link
                      href={`/landlord/maintenance/${req.id}`}
                      className="text-sm font-display font-bold text-navy underline"
                    >
                      View
                    </Link>
                    <form action={approveMaintenanceAction.bind(null, req.id)}>
                      <Button type="submit" className="text-sm py-1 px-3">
                        Approve
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <RequestList requests={active} basePath="/landlord/maintenance" />
    </>
  );
}
