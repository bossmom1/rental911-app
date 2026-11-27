import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const NAVY = '#0C447C';
const LIGHT_BLUE = '#B5D4F4';

export default async function QaReplaysPage() {
  const supabase = createSupabaseServerClient(cookies());
  const { data: replays } = await supabase
    .from('qa_replays')
    .select('*')
    .order('recorded_at', { ascending: false });

  const rows = replays ?? [];

  return (
    <>
      <PageHeader title="Q&A Replays" subtitle="Recordings of our live Q&A sessions." />

      {rows.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: `1.5px dashed ${LIGHT_BLUE}`,
            borderRadius: 12,
            padding: '48px 24px',
            textAlign: 'center',
            color: '#667',
          }}
        >
          Replays will appear here after your first live Q&amp;A.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '20px 24px',
                boxShadow: '0 1px 6px rgba(12,68,124,0.08)',
              }}
            >
              <div style={{ fontSize: 13, color: '#889', marginBottom: 4 }}>{fmtDate(r.recorded_at)}</div>
              <h3 style={{ margin: '0 0 8px', color: NAVY, fontSize: 18, fontWeight: 700 }}>{r.title}</h3>
              {r.description && <p style={{ margin: '0 0 12px', color: '#555' }}>{r.description}</p>}
              <a
                href={r.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: NAVY, fontWeight: 700, textDecoration: 'none' }}
              >
                Watch replay →
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
