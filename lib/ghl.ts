/**
 * GoHighLevel (GHL) integration — CRM contact sync + Calendar.
 *
 * All CRM sync calls are BACKGROUND / non-blocking: failures are logged and
 * swallowed so they never break signup, onboarding, or tenant creation.
 * Calendar reads/booking are used for the Step 8 onboarding call, coaching
 * calls, and maintenance vendor scheduling.
 *
 * NOTE: Phase 1 wires the contracts and safe no-op fallbacks. Full GHL sync is
 * finished in Phase 5. When keys are absent, every function is a silent no-op.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

function ghlConfig() {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  return { apiKey, locationId, configured: Boolean(apiKey && locationId) };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: GHL_API_VERSION,
  };
}

export interface GhlContactInput {
  name?: string | null;
  email: string;
  phone?: string | null;
  role: 'landlord' | 'tenant';
  tags?: string[];
}

/** POST a new contact to GHL. Non-blocking: returns false on any failure. */
export async function syncContact(input: GhlContactInput): Promise<boolean> {
  const { apiKey, locationId, configured } = ghlConfig();
  if (!configured) {
    console.warn('[ghl] not configured — skipping contact sync');
    return false;
  }
  try {
    const [firstName, ...rest] = (input.name ?? '').split(' ');
    const res = await fetch(`${GHL_BASE}/contacts/`, {
      method: 'POST',
      headers: headers(apiKey!),
      body: JSON.stringify({
        locationId,
        email: input.email,
        phone: input.phone ?? undefined,
        firstName: firstName || undefined,
        lastName: rest.join(' ') || undefined,
        tags: input.tags ?? [input.role],
      }),
    });
    if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    console.error('[ghl] syncContact failed (non-blocking):', err);
    return false;
  }
}

/** Add a tag to an existing contact (e.g. "onboarded-landlord"). Non-blocking. */
export async function addContactTag(
  contactId: string,
  tag: string
): Promise<boolean> {
  const { apiKey, configured } = ghlConfig();
  if (!configured) return false;
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: headers(apiKey!),
      body: JSON.stringify({ tags: [tag] }),
    });
    if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    console.error('[ghl] addContactTag failed (non-blocking):', err);
    return false;
  }
}

// ---- Calendar ---------------------------------------------------------------

/** GET /calendars — list Christine's GHL calendars. */
export async function listCalendars(): Promise<unknown[]> {
  const { apiKey, locationId, configured } = ghlConfig();
  if (!configured) return [];
  try {
    const res = await fetch(
      `${GHL_BASE}/calendars/?locationId=${locationId}`,
      { headers: headers(apiKey!) }
    );
    if (!res.ok) throw new Error(`GHL ${res.status}`);
    const data = (await res.json()) as { calendars?: unknown[] };
    return data.calendars ?? [];
  } catch (err) {
    console.error('[ghl] listCalendars failed:', err);
    return [];
  }
}

/** GET /calendars/{id}/free-slots — available times for a calendar. */
export async function getFreeSlots(
  calendarId: string,
  startDate: number,
  endDate: number
): Promise<unknown> {
  const { apiKey, configured } = ghlConfig();
  if (!configured) return null;
  try {
    const res = await fetch(
      `${GHL_BASE}/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}`,
      { headers: headers(apiKey!) }
    );
    if (!res.ok) throw new Error(`GHL ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[ghl] getFreeSlots failed:', err);
    return null;
  }
}

export interface GhlBookingInput {
  calendarId: string;
  contactId: string;
  startTime: string; // ISO 8601
  title?: string;
}

/** POST /calendars/events — book an appointment. */
export async function bookCalendarEvent(
  input: GhlBookingInput
): Promise<{ ok: boolean; id?: string }> {
  const { apiKey, locationId, configured } = ghlConfig();
  if (!configured) return { ok: false };
  try {
    const res = await fetch(`${GHL_BASE}/calendars/events`, {
      method: 'POST',
      headers: headers(apiKey!),
      body: JSON.stringify({
        calendarId: input.calendarId,
        locationId,
        contactId: input.contactId,
        startTime: input.startTime,
        title: input.title ?? 'Rental911 Appointment',
      }),
    });
    if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[ghl] bookCalendarEvent failed:', err);
    return { ok: false };
  }
}

/** Public iframe embed URL for the onboarding-call booking widget (Step 8). */
export const GHL_ONBOARDING_CALENDAR_EMBED =
  process.env.NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED || '';
