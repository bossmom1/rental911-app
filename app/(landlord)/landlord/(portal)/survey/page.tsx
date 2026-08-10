import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-gray-100 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-56 shrink-0 text-sm font-semibold text-navy">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-display text-base font-bold text-navy uppercase tracking-wide">
        {title}
      </h3>
      <dl className="rounded-xl border border-gray-200 bg-white px-4">{children}</dl>
    </div>
  );
}

export default async function MySurveyPage() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const email = current?.profile?.email;

  const { data: sub } = email
    ? await supabase
        .from('onboarding_submissions')
        .select('*')
        .eq('landlord_email', email)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()
    : { data: null };

  if (!sub) {
    return (
      <>
        <PageHeader
          title="My Onboarding Survey"
          subtitle="Your submitted onboarding information."
        />
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-ink font-semibold">No submission on file yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Complete the survey to get started.
          </p>
          <a
            href="https://survey.rental911.net"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-lg bg-gold px-5 py-2 text-sm font-bold text-navy hover:bg-gold/90 transition-colors"
          >
            Complete Your Onboarding Survey →
          </a>
        </div>
      </>
    );
  }

  const submittedDate = sub.submitted_at
    ? new Date(sub.submitted_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <>
      <PageHeader
        title="My Onboarding Survey"
        subtitle={`Submitted ${submittedDate} · Read-only`}
      />

      <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
        ✓ Submission received
      </div>

      <Section title="Contact Information">
        <Row label="Name" value={sub.landlord_name} />
        <Row label="Email" value={sub.landlord_email} />
        <Row label="Phone" value={sub.landlord_phone} />
      </Section>

      <Section title="Property Basics">
        <Row label="Property Address" value={sub.property_address} />
        <Row label="Property Type" value={sub.property_type} />
        <Row label="Year Built" value={sub.year_built} />
        <Row label="Number of Properties" value={sub.property_count} />
        <Row label="Active Leases" value={sub.active_leases} />
        <Row label="Lease Expiration" value={sub.lease_expiration_date} />
        <Row label="Monthly Rent" value={sub.monthly_rent} />
        <Row label="Utilities" value={sub.utilities_selection} />
      </Section>

      <Section title="Tenant & Compliance">
        <Row label="Section 8 Tenants" value={sub.section8_tenants} />
        <Row label="Code Violations" value={sub.code_violations} />
        <Row label="Pets on Property" value={sub.pets_on_property} />
        <Row label="Pet Policy" value={sub.pet_policy} />
        <Row label="Eviction History" value={sub.eviction_history} />
      </Section>

      <Section title="Security Deposit">
        <Row label="Security Deposit Amount" value={sub.security_deposit_amount} />
      </Section>

      <Section title="Home Warranty (AFC)">
        <Row label="Existing Warranty" value={sub.has_existing_warranty} />
        <Row label="Keep Own Warranty" value={sub.keep_own_warranty} />
        <Row label="AFC Tier Selected" value={sub.afc_tier} />
        <Row label="Deductible" value={sub.afc_deductible} />
        <Row label="Add-Ons" value={sub.afc_addons} />
      </Section>

      <Section title="HVAC">
        <Row label="HVAC Make / Model" value={sub.hvac_make_model} />
      </Section>

      <Section title="Maintenance Threshold">
        <Row label="Threshold Choice" value={sub.maintenance_threshold_choice} />
        <Row label="Custom Amount" value={sub.maintenance_threshold_custom} />
      </Section>

      <Section title="Acknowledgments & Signature">
        <Row label="Typed Signature" value={sub.typed_signature} />
      </Section>

      {sub.signature_url && (
        <div className="mt-6">
          <h3 className="mb-2 font-display text-base font-bold text-navy uppercase tracking-wide">
            Drawn Signature
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sub.signature_url}
              alt="Landlord signature"
              className="max-h-24 object-contain"
            />
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        This submission is locked and cannot be edited. Contact Christine if you need
        to make a correction.
      </p>
    </>
  );
}
