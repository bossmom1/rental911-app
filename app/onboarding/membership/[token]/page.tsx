import { createSupabaseAdminClient } from '@/lib/supabase';
import { MembershipIntakeClient } from './MembershipIntakeClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome to Rental911 Membership' };

const NAVY = '#0C447C';

function StatusPage({ icon, title, message }: { icon: string; title: string; message: string }) {
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
      <h2 style={{ color: NAVY, margin: '0 0 12px', fontSize: 22, fontWeight: 700 }}>{title}</h2>
      <p style={{ color: '#555', maxWidth: '420px', lineHeight: 1.6, fontSize: 16 }}>{message}</p>
    </main>
  );
}

type PageProps = { params: { token: string } };

export default async function MembershipOnboardingPage({ params }: PageProps) {
  const admin = createSupabaseAdminClient();

  const { data: payment } = await admin
    .from('landlord_onboarding_payments')
    .select('id, contact_name, contact_email, landlord_id')
    .eq('intake_token', params.token)
    .eq('tier', 'membership')
    .maybeSingle();

  if (!payment) {
    return (
      <StatusPage
        icon="❌"
        title="Link Not Found"
        message="This onboarding link is invalid. Please contact Rental911 at info@rental911.net for a new one."
      />
    );
  }

  if (payment.landlord_id) {
    return (
      <StatusPage
        icon="✓"
        title="You're All Set"
        message="This onboarding is already complete. Head to rental911.net/login to access your Member portal."
      />
    );
  }

  const { data: existingResponse } = await admin
    .from('membership_intake_responses')
    .select('id')
    .eq('payment_id', payment.id)
    .maybeSingle();

  return (
    <MembershipIntakeClient
      token={params.token}
      firstName={(payment.contact_name ?? '').split(' ')[0] || 'there'}
      intakeAlreadySubmitted={Boolean(existingResponse)}
    />
  );
}
