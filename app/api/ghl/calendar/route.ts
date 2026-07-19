import { NextResponse, type NextRequest } from 'next/server';
import { listCalendars, getFreeSlots, bookCalendarEvent } from '@/lib/ghl';

/**
 * GET  /api/ghl/calendar                       -> list Christine's calendars
 * GET  /api/ghl/calendar?calendarId=..&start=..&end=..  -> free slots (epoch ms)
 * POST /api/ghl/calendar  { calendarId, contactId, startTime, title } -> book
 *
 * Used for the onboarding call (Step 8), coaching calls, and vendor scheduling.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const calendarId = searchParams.get('calendarId');

  if (calendarId) {
    const start = Number(searchParams.get('start') || Date.now());
    const end = Number(
      searchParams.get('end') || Date.now() + 14 * 24 * 60 * 60 * 1000
    );
    const slots = await getFreeSlots(calendarId, start, end);
    return NextResponse.json({ ok: true, slots });
  }

  const calendars = await listCalendars();
  return NextResponse.json({ ok: true, calendars });
}

export async function POST(request: NextRequest) {
  try {
    const { calendarId, contactId, startTime, title } = await request.json();
    if (!calendarId || !contactId || !startTime) {
      return NextResponse.json(
        { ok: false, error: 'calendarId, contactId, startTime required' },
        { status: 400 }
      );
    }
    const result = await bookCalendarEvent({ calendarId, contactId, startTime, title });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ghl/calendar] booking error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
