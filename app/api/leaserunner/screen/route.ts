import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

/**
 * POST /api/leaserunner/screen  { tenantId }
 *
 * Tenant screening (credit, criminal background, eviction history).
 * PLACEHOLDER — returns mock data. Real LeaseRunner API keys are TBD (Phase 5).
 * Only landlords/admins reach real tenant data; results are landlord/admin-view only.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (me?.role !== 'landlord' && me?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let tenantId: string | undefined;
  try {
    ({ tenantId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // TODO(Phase 5): Replace this mock with real LeaseRunner API calls, e.g.:
  //   const res = await fetch(`${process.env.LEASERUNNER_API_BASE}/screenings`, {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${process.env.LEASERUNNER_API_KEY}` },
  //     body: JSON.stringify({ applicantId: tenantId }),
  //   });
  //   const report = await res.json();
  // ---------------------------------------------------------------------------
  const mockReport = {
    tenantId,
    generatedAt: new Date().toISOString(),
    credit: { score: 712, band: 'good' },
    criminal: { records: 0, status: 'clear' },
    eviction: { records: 0, status: 'clear' },
    recommendation: 'approve',
    source: 'mock',
  };

  return NextResponse.json({ ok: true, report: mockReport });
}
