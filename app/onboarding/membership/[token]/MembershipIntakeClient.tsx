'use client';

import { useState } from 'react';
import { submitMembershipIntake, completeMembershipOnboarding } from './actions';

const NAVY = '#0C447C';
const GOLD = '#EF9F27';
const LIGHT_BLUE = '#B5D4F4';
const GHL_EMBED = process.env.NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED || '';

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: `1.5px solid ${LIGHT_BLUE}`,
  borderRadius: 8,
  color: '#222',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: 14,
  color: NAVY,
  marginBottom: 6,
};

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: GOLD }}> *</span>}
      </label>
      {hint && <p style={{ fontSize: 13, color: '#667', margin: '0 0 8px' }}>{hint}</p>}
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ background: '#f0f7ff', minHeight: '100vh', padding: '32px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 24, color: NAVY, letterSpacing: '-0.5px' }}>
            Rental<span style={{ color: GOLD }}>911</span>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: '32px', boxShadow: '0 2px 12px rgba(12,68,124,0.10)' }}>
          {children}
        </div>
      </div>
    </main>
  );
}

type Extra = { id: number; label: string; file: File | null };

export function MembershipIntakeClient({
  token,
  firstName,
  intakeAlreadySubmitted,
}: {
  token: string;
  firstName: string;
  intakeAlreadySubmitted: boolean;
}) {
  const [step, setStep] = useState<'intake' | 'booking' | 'done'>(intakeAlreadySubmitted ? 'booking' : 'intake');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rentalLicenseStatus, setRentalLicenseStatus] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);

  async function handleIntakeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    extras.forEach((ex) => {
      if (ex.file) {
        formData.append('additional_files', ex.file);
        formData.append('additional_labels', ex.label || ex.file.name);
      }
    });
    const result = await submitMembershipIntake(token, formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    setStep('booking');
  }

  async function handleBooked() {
    setSubmitting(true);
    setError(null);
    const result = await completeMembershipOnboarding(token);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    setStep('done');
  }

  if (step === 'done') {
    return (
      <Shell>
        <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#2e7d32', fontWeight: 600, fontSize: 15 }}>
          ✓ You're all set
        </div>
        <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>Welcome to the Membership</h2>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Check your email for a link to set your password and log in to your Member portal. We'll see you at the
          live Q&amp;A!
        </p>
      </Shell>
    );
  }

  if (step === 'booking') {
    return (
      <Shell>
        <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Last step, {firstName}</h2>
        <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
          Grab a time on Christine's calendar for your kickoff call — this is where we'll go over your lease review
          and get your Member portal squared away.
        </p>
        {GHL_EMBED ? (
          <iframe
            src={GHL_EMBED}
            style={{ width: '100%', height: 560, border: 'none', borderRadius: 8 }}
            title="Book your kickoff call"
          />
        ) : (
          <div style={{ background: '#fff8e1', borderRadius: 8, padding: 16, color: '#7a5c00' }}>
            Calendar not configured — set <code>NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED</code>.
          </div>
        )}
        <div style={{ marginTop: 20, background: '#f0f7ff', borderRadius: 8, padding: 16, color: '#333' }}>
          After you book, click <strong>"I've booked my call."</strong> Your Member portal opens in limited access
          until Christine confirms the call.
        </div>
        {error && <p style={{ color: '#c0392b', marginTop: 12 }}>{error}</p>}
        <button
          onClick={handleBooked}
          disabled={submitting}
          style={{
            marginTop: 20,
            background: GOLD,
            color: NAVY,
            fontWeight: 800,
            border: 'none',
            borderRadius: 999,
            padding: '14px 32px',
            fontSize: 15,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Setting up your portal…' : "I've booked my call"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Welcome, {firstName}!</h2>
      <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
        A few quick details so I can prep for your kickoff call — about 5 minutes.
      </p>
      <form onSubmit={handleIntakeSubmit}>
        <Field label="A copy of your current lease" required hint="So I can review it against 2026 Maryland compliance before we talk.">
          <input type="file" name="lease_file" accept=".pdf,.doc,.docx,image/*" required style={inputStyle} />
        </Field>

        <Field label="Do you have a rental license?" required>
          <select
            name="rental_license_status"
            required
            style={inputStyle}
            value={rentalLicenseStatus}
            onChange={(e) => setRentalLicenseStatus(e.target.value)}
          >
            <option value="">Select one…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not_sure">Not sure</option>
          </select>
        </Field>

        {rentalLicenseStatus === 'yes' && (
          <Field label="A copy of your rental license">
            <input type="file" name="rental_license_file" accept=".pdf,.doc,.docx,image/*" style={inputStyle} />
          </Field>
        )}

        <Field label="Do you know your lead paint status?" required>
          <select name="lead_paint_status" required style={inputStyle} defaultValue="">
            <option value="">Select one…</option>
            <option value="yes">Yes, I know it</option>
            <option value="no">No</option>
            <option value="not_sure">Not sure</option>
          </select>
        </Field>

        <Field label="Any other documents?" hint="Court papers, notices, anything else you want me to see before we talk — optional.">
          {extras.map((ex) => (
            <div key={ex.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Label (e.g. Eviction notice)"
                value={ex.label}
                onChange={(e) =>
                  setExtras((prev) => prev.map((x) => (x.id === ex.id ? { ...x, label: e.target.value } : x)))
                }
                style={{ ...inputStyle, flex: '0 0 45%' }}
              />
              <input
                type="file"
                onChange={(e) =>
                  setExtras((prev) =>
                    prev.map((x) => (x.id === ex.id ? { ...x, file: e.target.files?.[0] ?? null } : x))
                  )
                }
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExtras((prev) => [...prev, { id: Date.now(), label: '', file: null }])}
            style={{ background: 'none', border: `1.5px dashed ${LIGHT_BLUE}`, borderRadius: 8, padding: '8px 14px', color: NAVY, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add a document
          </button>
        </Field>

        <Field label="Do you currently use any property management software?" hint="DoorLoop, Buildium, Avail, spreadsheets, none — whatever you use today.">
          <input type="text" name="current_pm_software" style={inputStyle} />
        </Field>

        <Field label="What's your biggest challenge as a landlord right now?" required>
          <textarea name="biggest_challenge" required rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>

        <Field label="Preferred contact method" required>
          <select name="preferred_contact_method" required style={inputStyle} defaultValue="">
            <option value="">Select one…</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="call">Call</option>
          </select>
        </Field>

        {error && <p style={{ color: '#c0392b', marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: GOLD,
            color: NAVY,
            fontWeight: 800,
            border: 'none',
            borderRadius: 999,
            padding: '14px 32px',
            fontSize: 15,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Submitting…' : 'Continue to booking →'}
        </button>
      </form>
    </Shell>
  );
}
