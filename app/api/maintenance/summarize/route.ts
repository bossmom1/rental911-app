import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { summarizeMaintenanceThread } from '@/lib/anthropic';

/**
 * POST /api/maintenance/summarize  { requestId }
 *
 * Generates an AI summary of a closed maintenance thread and stores it in
 * maintenance_requests.chat_summary. Failures are logged and returned as a
 * soft error — this endpoint must NEVER block the status change that triggered
 * it (the client fires it after already setting status='closed').
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient(cookies());

  // Only participants (admin/landlord via RLS) can reach the rows below.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let requestId: string | undefined;
  try {
    ({ requestId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
  if (!requestId) {
    return NextResponse.json({ ok: false, error: 'requestId required' }, { status: 400 });
  }

  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('id, title')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from('maintenance_chat')
    .select('sender_role, message')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  // Best-effort vendor name for the summary.
  const { data: dispatch } = await supabase
    .from('vendor_dispatches')
    .select('vendor:vendors(name)')
    .eq('request_id', requestId)
    .order('dispatched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const vendorName = (dispatch as any)?.vendor?.name ?? null;

  try {
    const summary = await summarizeMaintenanceThread(messages ?? [], {
      title: req.title,
      vendor: vendorName,
    });
    await supabase
      .from('maintenance_requests')
      .update({ chat_summary: summary })
      .eq('id', requestId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    // Log, but do not surface as a hard failure — the request stays closed.
    console.error('[summarize] failed (non-blocking):', err);
    return NextResponse.json({ ok: false, error: 'summary_failed' }, { status: 200 });
  }
}
