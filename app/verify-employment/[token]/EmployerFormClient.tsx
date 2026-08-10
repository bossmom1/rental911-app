'use client';

import { useState } from 'react';

interface Props {
  token: string;
  tenantName: string;
  employerContactName?: string;
}

const NAVY = '#0C447C';
const GOLD = '#EF9F27';
const LIGHT_BLUE = '#B5D4F4';

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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: GOLD }}> *</span>}
      </label>
      {children}
    </div>
  );
}

export function EmployerFormClient({ token, tenantName, employerContactName }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);

    const payload = {
      token,
      response: {
        company_name: String(fd.get('company_name') ?? '').trim(),
        job_title: String(fd.get('job_title') ?? '').trim(),
        employment_start_date: String(fd.get('employment_start_date') ?? '').trim(),
        employment_status: String(fd.get('employment_status') ?? '').trim(),
        monthly_gross_income: Number(fd.get('monthly_gross_income') ?? 0),
        additional_notes: String(fd.get('additional_notes') ?? '').trim() || undefined,
        authorized_by: String(fd.get('authorized_by') ?? '').trim(),
        date_completed: String(fd.get('date_completed') ?? '').trim(),
      },
    };

    try {
      const res = await fetch('/api/employment-verification/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main
        style={{
          background: '#f0f7ff',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#fff',
            borderRadius: 12,
            padding: 40,
            boxShadow: '0 2px 12px rgba(12,68,124,0.12)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: NAVY, fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
            Thank You
          </h2>
          <p style={{ color: '#555', fontSize: 16, lineHeight: 1.6, margin: 0 }}>
            The employment verification has been submitted and filed. The landlord has been
            notified.
          </p>
        </div>
      </main>
    );
  }

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
        {/* Logo */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{ fontWeight: 800, fontSize: 24, color: NAVY, letterSpacing: '-0.5px' }}
          >
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
          <h1
            style={{ color: NAVY, fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}
          >
            Employment Verification Request
          </h1>
          <p
            style={{
              color: '#555',
              fontSize: 16,
              lineHeight: 1.6,
              margin: '0 0 28px',
            }}
          >
            You have been asked to verify the employment of{' '}
            <strong>{tenantName}</strong> as part of a rental application. Please complete
            this form accurately. Your information is kept confidential and is used solely
            for rental qualification purposes.
          </p>

          {error && (
            <div
              style={{
                background: '#fff0f0',
                border: '1px solid #ffcdd2',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 24,
                color: '#c62828',
                fontSize: 15,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Applicant name — pre-filled, read-only */}
            <Field label="Applicant / Employee Name" required>
              <input
                style={{ ...inputStyle, background: '#f5f8fb', color: '#555' }}
                value={tenantName}
                readOnly
              />
            </Field>

            <Field label="Employer Company Name" required>
              <input
                style={inputStyle}
                name="company_name"
                required
                placeholder="e.g. Acme Corporation"
              />
            </Field>

            <Field label="Applicant's Job Title / Position" required>
              <input
                style={inputStyle}
                name="job_title"
                required
                placeholder="e.g. Senior Accountant"
              />
            </Field>

            <Field label="Employment Start Date" required>
              <input style={inputStyle} name="employment_start_date" type="date" required />
            </Field>

            <Field label="Employment Status" required>
              <select
                style={inputStyle}
                name="employment_status"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select status…
                </option>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="seasonal">Seasonal</option>
              </select>
            </Field>

            <Field label="Monthly Gross Income ($)" required>
              <input
                style={inputStyle}
                name="monthly_gross_income"
                type="number"
                min={0}
                step={1}
                required
                placeholder="e.g. 5000"
              />
            </Field>

            <Field label="Additional Notes (optional)">
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                name="additional_notes"
                placeholder="Any relevant details about the employment…"
              />
            </Field>

            {/* Signature acknowledgment */}
            <div
              style={{
                borderTop: `1px solid ${LIGHT_BLUE}`,
                paddingTop: 20,
                marginBottom: 4,
              }}
            >
              <p
                style={{
                  color: '#555',
                  fontSize: 14,
                  margin: '0 0 20px',
                  lineHeight: 1.6,
                }}
              >
                By submitting this form, I confirm that the information above is accurate
                and complete to the best of my knowledge, and that I am authorized to
                provide this employment information.
              </p>

              <Field label="Authorized By (your full name)" required>
                <input
                  style={inputStyle}
                  name="authorized_by"
                  required
                  placeholder={employerContactName ?? 'Your full name'}
                />
              </Field>

              <Field label="Date" required>
                <input
                  style={inputStyle}
                  name="date_completed"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'block',
                width: '100%',
                padding: '14px 24px',
                background: submitting ? '#7aabdc' : NAVY,
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
                border: 'none',
                borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Employment Verification'}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#888',
            marginTop: 20,
          }}
        >
          Questions? Contact Rental911 at{' '}
          <a href="mailto:info@rental911.net" style={{ color: NAVY }}>
            info@rental911.net
          </a>
        </p>
      </div>
    </main>
  );
}
