import { NextResponse, type NextRequest } from 'next/server';
import { syncContact } from '@/lib/ghl';

/**
 * POST /api/ghl/sync-contact  { name, email, phone, role }
 * Background CRM sync. Always returns 200 — failures are logged, never blocking.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, role } = body ?? {};
    if (!email || !role) {
      return NextResponse.json({ ok: false, error: 'email and role required' });
    }
    const ok = await syncContact({
      name,
      email,
      phone,
      role,
      tags: role === 'landlord' ? ['landlord'] : ['tenant'],
    });
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('[ghl/sync-contact] error (non-blocking):', err);
    return NextResponse.json({ ok: false });
  }
}
