import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/webhooks/ghl-survey
 *
 * Receives survey submission events from GoHighLevel (Leads To ROI) for the
 * Rental911 Landlord Onboarding Survey (ID: 7G9rYnBPXg57BDmHgqGy).
 *
 * Security: The GHL webhook URL should be configured with the secret as a
 * query param: .../api/webhooks/ghl-survey?secret=<GHL_WEBHOOK_SECRET>.
 * Set GHL_WEBHOOK_SECRET in Vercel env vars. If not set, all requests are
 * accepted (dev/testing only).
 *
 * Idempotent: ghl_submission_id has a unique constraint, so duplicate
 * deliveries upsert in place without creating duplicate rows.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rental911 Landlord Onboarding Survey — known GHL survey ID
const EXPECTED_SURVEY_ID = '7G9rYnBPXg57BDmHgqGy';

/** Safely extract a string value from the GHL formData payload. */
function field(formData: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = formData[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (Array.isArray(val) && val.length > 0) return val.join(', ');
  }
  return null;
}

export async function POST(request: NextRequest) {
  // ── Security check ──────────────────────────────────────────────────────────
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      request.nextUrl.searchParams.get('secret') ??
      request.headers.get('x-ghl-secret');
    if (!provided || provided !== secret) {
      console.warn('[ghl-survey/webhook] rejected: bad or missing secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse payload ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // GHL may wrap the event in a `data` envelope or send it flat
  const payload = (body.data as Record<string, unknown>) ?? body;

  // Verify this is a survey submission for our survey
  const surveyId = (payload.surveyId ?? payload.survey_id) as string | undefined;
  if (surveyId && surveyId !== EXPECTED_SURVEY_ID) {
    // Different survey — acknowledge but don't store
    console.log('[ghl-survey/webhook] ignored: survey', surveyId);
    return NextResponse.json({ received: true });
  }

  // ── Extract fields ───────────────────────────────────────────────────────────
  // GHL sends formData as a flat object keyed by the field's query key or label.
  // We try common GHL key patterns for each field.
  const formData = ((payload.formData ?? payload.form_data ?? payload.fields) as Record<string, unknown>) ?? {};

  // Contact info — GHL often includes these at the top level too
  const contactId = (payload.contactId ?? payload.contact_id ?? payload.id) as string | undefined;
  const submissionId = (payload.submissionId ?? payload.submission_id ?? payload.formSubmissionId) as string | undefined;

  // Top-level contact details (GHL flattens these)
  const topName = (payload.name ?? payload.full_name) as string | undefined;
  const topEmail = (payload.email) as string | undefined;
  const topPhone = (payload.phone) as string | undefined;

  const submittedAt = (payload.submittedAt ?? payload.submitted_at ?? payload.dateAdded) as string | undefined;

  // ── Write to Supabase ────────────────────────────────────────────────────────
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from('onboarding_submissions')
    .upsert(
      {
        ghl_contact_id:    contactId ?? null,
        ghl_submission_id: submissionId ?? null,
        submitted_at:      submittedAt ? new Date(submittedAt).toISOString() : new Date().toISOString(),

        // Contact
        landlord_name:  field(formData, 'full_name', 'name', 'firstName', 'first_name') ?? topName ?? null,
        landlord_email: field(formData, 'email', 'email_address') ?? topEmail ?? null,
        landlord_phone: field(formData, 'phone', 'phone_number') ?? topPhone ?? null,

        // Property basics (Slide 1)
        property_address:     field(formData, 'address', 'property_address', 'address1'),
        property_type:        field(formData, 'What type of rental property is this?', 'property_type'),
        year_built:           field(formData, 'What year was the property built?', 'year_built'),
        property_count:       field(formData, 'How many rental properties do you currently own and manage?', 'property_count'),
        active_leases:        field(formData, 'Do you currently have active leases', 'active_leases'),
        lease_expiration_date: field(formData, 'What is the current lease expiration date?', 'lease_expiration'),
        monthly_rent:         field(formData, 'What is the current monthly rent amount?', 'monthly_rent', 'rent_amount'),
        utilities_selection:  field(formData, 'Which utilities are included in the rent?', 'utilities'),
        utilities_initials:   field(formData, 'single_line_239xr7', 'utilities_initials'),

        // Tenant / compliance (Slide 1)
        section8_tenants:     field(formData, 'Do you have any tenants on Section 8', 'section8_tenants'),
        code_violations:      field(formData, 'Are there any outstanding municipal or county code violations', 'code_violations'),
        pets_on_property:     field(formData, 'Do any current tenants have pets', 'pets_on_property'),
        pet_policy:           field(formData, 'What is your going-forward pet policy', 'pet_policy'),
        eviction_history:     field(formData, 'eviction history', 'eviction_history', 'Have you ever had to evict'),

        // Security deposit (Slide 1)
        security_deposit_amount: field(formData, 'What is the total security deposit amount', 'security_deposit', 'security_deposit_amount'),
        no_funds_initials:       field(formData, 'Please type your initials to acknowledge that Rental911 does not hold security deposits', 'no_funds_initials'),

        // Home warranty (Slide 2)
        has_existing_warranty:  field(formData, 'Do you currently have a home warranty in place', 'has_existing_warranty'),
        keep_own_warranty:      field(formData, 'Do you want to keep your current home warranty', 'keep_own_warranty'),
        warranty_initials:      field(formData, 'single_line_2355dw', 'warranty_initials', 'If you are keeping your own home warranty'),
        afc_tier:               field(formData, 'What coverage tier do you have', 'afc_tier', 'coverage_tier'),
        afc_deductible:         field(formData, 'radio_37552', 'What is your preferred service call fee', 'afc_deductible'),
        afc_addons:             field(formData, 'checkbox_12879', 'Optional add-ons', 'afc_addons'),

        // HVAC (Slide 2)
        hvac_make_model:      field(formData, 'What is the make and model of your property\'s A/C', 'hvac_make_model', 'hvac'),
        multi_property_list:  field(formData, 'If you own more than one property, list each property address', 'multi_property_list'),

        // Maintenance threshold (Slide 3)
        maintenance_threshold_choice:   field(formData, 'Maintenance Threshold Selection', 'maintenance_threshold_choice'),
        maintenance_threshold_custom:   field(formData, 'If custom, enter your preferred threshold amount', 'maintenance_threshold_custom'),
        maintenance_threshold_initials: field(formData, 'Please type your initials to acknowledge your maintenance authorization threshold', 'maintenance_threshold_initials'),

        // Right of entry (Slide 3)
        right_of_entry_initials: field(formData, 'Please type your initials to acknowledge the Right of Entry disclosure', 'right_of_entry_initials'),

        // Signature (Slide 3)
        typed_signature: field(formData, 'single_line_243i9r', 'Prefer to type? Enter your full legal name', 'typed_signature'),
        signature_url:   field(formData, 'signature', 'signature_url', 'Draw your signature'),

        // Full raw payload — never lose anything
        raw_responses: payload as any,

        status: 'new',
      },
      {
        onConflict:     'ghl_submission_id',
        ignoreDuplicates: false, // upsert on duplicate
      }
    );

  if (error) {
    // Log but also return 500 so GHL retries delivery
    console.error('[ghl-survey/webhook] upsert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[ghl-survey/webhook] stored submission', submissionId ?? 'no-id');
  return NextResponse.json({ received: true });
}
