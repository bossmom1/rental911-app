import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { AddPropertyForm, AddUnitForm } from '@/components/landlord/AddForms';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LandlordProperties() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  const { data: properties } = await supabase
    .from('properties')
    .select('*, units(id, unit_number, bedrooms, bathrooms, monthly_rent, status)')
    .eq('landlord_id', meId)
    .order('created_at', { ascending: false });

  const rows = (properties ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle="Your properties and units."
        action={<AddPropertyForm />}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No properties yet"
          message="Add your first property to start managing units and tenants."
        />
      ) : (
        <div className="space-y-6">
          {rows.map((p) => (
            <Card key={p.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-navy">
                    {p.name || p.address}
                  </h2>
                  <p className="text-ink/70">
                    {[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')}
                    {p.county ? ` · ${p.county} County` : ''}
                  </p>
                </div>
                {p.lead_paint_required && <Badge value="lead paint required" />}
              </div>

              {(p.units ?? []).length === 0 ? (
                <p className="text-ink/70">No units yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-light-blue/60 text-navy">
                        <th className="py-2 font-display font-bold">Unit</th>
                        <th className="py-2 font-display font-bold">Beds/Baths</th>
                        <th className="py-2 font-display font-bold">Rent</th>
                        <th className="py-2 font-display font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-blue/40">
                      {p.units.map((u: any) => (
                        <tr key={u.id}>
                          <td className="py-2">{u.unit_number}</td>
                          <td className="py-2">
                            {u.bedrooms ?? '—'} bd / {u.bathrooms ?? '—'} ba
                          </td>
                          <td className="py-2">{fmtMoney(u.monthly_rent)}</td>
                          <td className="py-2">
                            <Badge value={u.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <AddUnitForm propertyId={p.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
