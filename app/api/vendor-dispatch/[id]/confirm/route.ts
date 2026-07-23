import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/vendor-dispatch/:id/confirm  { scheduledDate: string }
 *
 * Public, unauthenticated — vendors aren't Rental911 users. The dispatch id
 * (an unguessable UUID) is the only "token"; this mirrors how the Stripe
 * webhook route uses the service-role client for an unauthenticated external
 * caller. Confirms scheduling only — this is not an accept/decline action,
 * vendors are network members and are assumed to take the job.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  let scheduledDate: string | undefined;
  try {
    ({ scheduledDate } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }
  if (!scheduledDate) {
    return NextResponse.json({ ok: false, error: 'A scheduled date is required.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: dispatch, error: fetchErr } = await admin
    .from('vendor_dispatches')
    .select('id, request_id, vendor:vendors(name)')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchErr || !dispatch) {
    return NextResponse.json({ ok: false, error: 'Dispatch not found.' }, { status: 404 });
  }

  const { error: updateErr } = await admin
    .from('vendor_dispatches')
    .update({
      scheduled_date: scheduledDate,
      vendor_response: 'confirmed',
      confirmed_by: 'vendor',
      responded_at: new Date().toISOString(),
    })
    .eq('id', params.id);
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  const vendorName = (dispatch as any).vendor?.name ?? 'The vendor';
  await admin.from('maintenance_chat').insert({
    request_id: dispatch.request_id,
    sender_id: null,
    sender_role: 'system',
    message: `Confirmed — ${vendorName} is scheduled for ${scheduledDate}.`,
  });

  await admin.from('maintenance_requests').update({ status: 'vendor_assigned' }).eq('id', dispatch.request_id);

  return NextResponse.json({ ok: true });
}
