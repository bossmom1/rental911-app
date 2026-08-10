import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtDateTime } from '@/lib/format';
import { markReviewedAction } from '../actions';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <tr>
      <td className="px-4 py-2 text-ink/60 font-medium text-sm w-56 align-top">{label}</td>
      <td className="px-4 py-2 text-ink text-sm whitespace-pre-wrap">{value}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="font-display font-bold text-navy text-lg mb-2 border-b border-navy/20 pb-1">
        {title}
      </h3>
      <table className="w-full">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default async function SubmissionDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const { data: s } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!s) notFound();

  return (
    <>
      <PageHeader
        title={s.landlord_name || 'Unnamed Submission'}
        subtitle={
          <>
            <Badge value={s.status} />
            <span className="ml-2 text-ink/60 text-sm">
              Submitted {fmtDateTime(s.submitted_at)}
            </span>
          </>
        }
      />

      <div className="flex gap-3 mb-8">
        <Link
          href="/admin/onboarding-submissions"
          className="font-display font-bold text-navy underline text-sm"
        >
          ← Back to all submissions
        </Link>
      </div>

      {/* Admin actions */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {s.status === 'new' && (
          <form action={markReviewedAction.bind(null, s.id)}>
            <Button type="submit" variant="outline">
              Mark as Reviewed
            </Button>
          </form>
        )}
        {s.status !== 'converted' && (
          <p className="text-sm text-ink/60 self-center">
            To create an app account: go to{' '}
            <Link href="/admin/landlords" className="underline text-navy">
              Landlords
            </Link>{' '}
            and invite this person — then come back and the system will link the submission.
          </p>
        )}
        {s.converted_landlord_id && (
          <Badge value="converted" />
        )}
      </div>

      {/* ── Parsed fields ── */}
      <Section title="Contact">
        <Row label="Name" value={s.landlord_name} />
        <Row label="Email" value={s.landlord_email} />
        <Row label="Phone" value={s.landlord_phone} />
      </Section>

      <Section title="Property Basics">
        <Row label="Address" value={s.property_address} />
        <Row label="Type" value={s.property_type} />
        <Row label="Year built" value={s.year_built} />
        <Row label="Properties owned" value={s.property_count} />
        <Row label="Active leases" value={s.active_leases} />
        <Row label="Lease expiration" value={s.lease_expiration_date} />
        <Row label="Monthly rent" value={s.monthly_rent} />
        <Row label="Utilities" value={s.utilities_selection} />
        <Row label="Utilities initials" value={s.utilities_initials} />
      </Section>

      <Section title="Tenant & Compliance">
        <Row label="Section 8 tenants" value={s.section8_tenants} />
        <Row label="Code violations" value={s.code_violations} />
        <Row label="Pets on property" value={s.pets_on_property} />
        <Row label="Pet policy" value={s.pet_policy} />
        <Row label="Eviction history" value={s.eviction_history} />
      </Section>

      <Section title="Security Deposit">
        <Row label="Deposit amount" value={s.security_deposit_amount} />
        <Row label="No-funds initials" value={s.no_funds_initials} />
      </Section>

      <Section title="Home Warranty">
        <Row label="Has existing warranty" value={s.has_existing_warranty} />
        <Row label="Keeping own warranty" value={s.keep_own_warranty} />
        <Row label="Warranty initials" value={s.warranty_initials} />
        <Row label="AFC tier" value={s.afc_tier} />
        <Row label="AFC deductible" value={s.afc_deductible} />
        <Row label="AFC add-ons" value={s.afc_addons} />
      </Section>

      <Section title="HVAC / Filter">
        <Row label="HVAC make/model" value={s.hvac_make_model} />
        <Row label="Multi-property list" value={s.multi_property_list} />
      </Section>

      <Section title="Maintenance Threshold (Slide 3)">
        <Row label="Threshold choice" value={s.maintenance_threshold_choice} />
        <Row label="Custom amount" value={s.maintenance_threshold_custom} />
        <Row label="Threshold initials" value={s.maintenance_threshold_initials} />
      </Section>

      <Section title="Right of Entry & Signature">
        <Row label="Entry initials" value={s.right_of_entry_initials} />
        <Row label="Typed signature" value={s.typed_signature} />
        {s.signature_url && (
          <tr>
            <td className="px-4 py-2 text-ink/60 font-medium text-sm w-56 align-top">Draw signature</td>
            <td className="px-4 py-2">
              <a
                href={s.signature_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy underline text-sm"
              >
                View signature image ↗
              </a>
            </td>
          </tr>
        )}
      </Section>

      {/* Admin notes */}
      {s.notes && (
        <Section title="Notes">
          <tr>
            <td colSpan={2} className="px-4 py-2 text-sm whitespace-pre-wrap">
              {s.notes}
            </td>
          </tr>
        </Section>
      )}

      {/* Raw JSON — always available as fallback */}
      <div className="mb-8">
        <h3 className="font-display font-bold text-navy text-lg mb-2 border-b border-navy/20 pb-1">
          Raw GHL Payload
        </h3>
        <pre className="bg-ink/5 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap text-ink/80">
          {JSON.stringify(s.raw_responses, null, 2)}
        </pre>
      </div>
    </>
  );
}
