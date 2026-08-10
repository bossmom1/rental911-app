import { createSupabaseAdminClient } from '@/lib/supabase';
import { EmployerFormClient } from './EmployerFormClient';
import type { EmploymentVerificationResponse } from '@/types/database';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Employment Verification | Rental911' };

/**
 * Public, unauthenticated page.
 * Sent to the employer via email — the token is the auth mechanism.
 * No Rental911 login required.
 */

const NAVY = '#0C447C';
const GOLD = '#EF9F27';

function StatusPage({
  icon,
  title,
  message,
}: {
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        padding: '24px',
        background: '#f0f7ff',
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ color: NAVY, margin: '0 0 12px', fontSize: 22, fontWeight: 700 }}>
        {title}
      </h2>
      <p style={{ color: '#555', maxWidth: '420px', lineHeight: 1.6, fontSize: 16 }}>
        {message}
      </p>
    </main>
  );
}

function CompletedView({
  record,
  tenantName,
}: {
  record: { employer_name: string | null; response: EmploymentVerificationResponse | null };
  tenantName: string;
}) {
  const resp = record.response;

  const fields: Array<[string, string]> = [
    ['Applicant / Employee Name', tenantName],
    ['Employer Company Name', resp?.company_name ?? '—'],
    ['Job Title / Position', resp?.job_title ?? '—'],
    ['Employment Start Date', resp?.employment_start_date ?? '—'],
    [
      'Employment Status',
      resp?.employment_status
        ? resp.employment_status.replace(/_/g, ' ')
        : '—',
    ],
    [
      'Monthly Gross Income',
      resp?.monthly_gross_income != null
        ? `$${Number(resp.monthly_gross_income).toLocaleString('en-US')}`
        : '—',
    ],
    ['Additional Notes', resp?.additional_notes || 'None'],
    ['Authorized By', resp?.authorized_by ?? '—'],
    ['Date Completed', resp?.date_completed ?? '—'],
  ];

  return (
    <main
      style={{
        background: '#f0f7ff',
        minHeight: '100vh',
        padding: '32px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 24, color: NAVY, letterSpacing: '-0.5px' }}>
            Rental<span style={{ color: GOLD }}>911</span>
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '32px',
            boxShadow: '0 2px 12px rgba(12,68,124,0.10)',
          }}
        >
          <div
            style={{
              background: '#e8f5e9',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 24,
              color: '#2e7d32',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            ✓ Employment verification completed
          </div>

          <h2
            style={{ color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 20px' }}
          >
            Submitted Information
          </h2>

          <dl style={{ display: 'grid', gap: '16px', margin: 0 }}>
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: NAVY,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 2,
                  }}
                >
                  {label}
                </dt>
                <dd
                  style={{
                    fontSize: 16,
                    color: '#222',
                    margin: 0,
                    textTransform:
                      label === 'Employment Status' ? 'capitalize' : undefined,
                  }}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </main>
  );
}

type PageProps = { params: { token: string } };

export default async function VerifyEmploymentPage({ params }: PageProps) {
  const admin = createSupabaseAdminClient();

  const { data: record } = await admin
    .from('employment_verifications')
    .select(
      '*, tenant:users!employment_verifications_tenant_id_fkey(full_name)'
    )
    .eq('token', params.token)
    .maybeSingle();

  if (!record) {
    return (
      <StatusPage
        icon="❌"
        title="Link Not Found"
        message="This verification link is invalid. Please contact the sender for a new link."
      />
    );
  }

  const isExpired =
    record.status === 'expired' || new Date(record.token_expires_at) < new Date();

  if (isExpired) {
    return (
      <StatusPage
        icon="⏰"
        title="Link Expired"
        message="This employment verification link has expired. Please contact Rental911 at info@rental911.net to request a new one."
      />
    );
  }

  const tenantName =
    (record as unknown as { tenant: { full_name: string | null } | null }).tenant
      ?.full_name ?? 'your applicant';

  if (record.status === 'completed') {
    return (
      <CompletedView
        record={{
          employer_name: record.employer_name,
          response: record.response as EmploymentVerificationResponse | null,
        }}
        tenantName={tenantName}
      />
    );
  }

  return (
    <EmployerFormClient
      token={params.token}
      tenantName={tenantName}
      employerContactName={record.employer_contact_name ?? undefined}
    />
  );
}
