'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type SigningRequest = {
  id: string;
  token: string;
  document_title: string;
  signer_name: string;
  signer_email: string;
  status: 'pending' | 'signed' | 'expired';
  created_at: string;
  signed_at: string | null;
};

type Field = {
  id: string;
  type: 'signature' | 'initials' | 'date';
  page: number;
  xPct: number;
  yPct: number;
};

const FIELD_COLORS: Record<Field['type'], string> = {
  signature: '#1A5BA6',
  initials:  '#2E7D32',
  date:      '#E65100',
};

const FIELD_LABELS: Record<Field['type'], string> = {
  signature: 'SIGN HERE',
  initials:  'INITIALS',
  date:      'DATE',
};

export default function DocumentsClient({ requests }: { requests: SigningRequest[] }) {
  const [view, setView]               = useState<'list' | 'prepare'>('list');
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [signerName, setSignerName]   = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [docTitle, setDocTitle]       = useState('');
  const [file, setFile]               = useState<File | null>(null);
  const [fields, setFields]           = useState<Field[]>([]);
  const [activeType, setActiveType]   = useState<Field['type']>('signature');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages]   = useState(0);
  const [pdfReady, setPdfReady]       = useState(false);
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState('');
  const [sentUrl, setSentUrl]         = useState('');
  const [dragOver, setDragOver]       = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pdfDocRef  = useRef<any>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF.js once
  useEffect(() => {
    if ((window as any).pdfjsLib) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    };
    document.head.appendChild(script);
  }, []);

  // Render a page to canvas
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); }
    const page = await pdfDocRef.current.getPage(pageNum);
    const scale = Math.min(1.4, (window.innerWidth * 0.6) / page.getViewport({ scale: 1 }).width);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    if (overlayRef.current) {
      overlayRef.current.style.width  = `${viewport.width}px`;
      overlayRef.current.style.height = `${viewport.height}px`;
    }
    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* cancelled */ }
    setCurrentPage(pageNum);
  }, []);

  // Load PDF when file is set and we move to step 2
  useEffect(() => {
    if (!file || step !== 2) return;
    const load = async () => {
      const tryLoad = async () => {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) { setTimeout(tryLoad, 300); return; }
        const raw = await file.arrayBuffer();
        pdfBytesRef.current = new Uint8Array(raw);
        const doc = await pdfjsLib.getDocument({ data: pdfBytesRef.current.slice() }).promise;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        await renderPage(1);
        setPdfReady(true);
      };
      tryLoad();
    };
    load();
  }, [file, step, renderPage]);

  const handleFileSelect = (f: File) => {
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setFile(f);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top)  / rect.height;
    setFields(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: activeType,
      page: currentPage,
      xPct,
      yPct,
    }]);
  }, [activeType, currentPage]);

  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id));

  const handleSend = async () => {
    if (!file) return;
    setSending(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('signerName', signerName);
    fd.append('signerEmail', signerEmail);
    fd.append('documentTitle', docTitle);
    fd.append('fields', JSON.stringify(fields));
    const res  = await fetch('/api/signing/create', { method: 'POST', body: fd });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error || 'Failed to send'); return; }
    setSentUrl(data.signingUrl);
    setStep(3);
  };

  const resetPrepare = () => {
    setStep(1); setFile(null); setFields([]); setSignerName('');
    setSignerEmail(''); setDocTitle(''); setSentUrl(''); setError('');
    setPdfReady(false); pdfDocRef.current = null; pdfBytesRef.current = null;
  };

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: '32px', fontFamily: 'sans-serif', maxWidth: '900px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1A5BA6' }}>Document Signing</h1>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
              Send documents to clients for electronic signature
            </p>
          </div>
          <button
            onClick={() => { setView('prepare'); setStep(1); }}
            style={{
              background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '12px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            + New Document
          </button>
        </div>

        {requests.length === 0 ? (
          <div style={{
            border: '2px dashed #ddd', borderRadius: '12px', padding: '64px',
            textAlign: 'center', color: '#999',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <p style={{ margin: 0, fontSize: '16px' }}>No documents sent yet.</p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>Click "New Document" to send your first signing request.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                {['Document', 'Recipient', 'Status', 'Sent', 'Signed'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#888', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#222' }}>{r.document_title}</td>
                  <td style={{ padding: '12px', color: '#444' }}>
                    <div>{r.signer_name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{r.signer_email}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                      background: r.status === 'signed' ? '#E8F5E9' : r.status === 'pending' ? '#FFF3E0' : '#FAFAFA',
                      color:      r.status === 'signed' ? '#2E7D32' : r.status === 'pending' ? '#E65100' : '#999',
                    }}>
                      {r.status === 'signed' ? '✅ Signed' : r.status === 'pending' ? '⏳ Pending' : 'Expired'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                    {r.signed_at ? new Date(r.signed_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── PREPARE VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', fontFamily: 'sans-serif', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={() => { setView('list'); resetPrepare(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A5BA6', fontSize: '14px', padding: 0 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#222' }}>Prepare Document for Signing</h1>

        {/* Step indicators */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(['1', '2', '3'] as const).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {i > 0 && <div style={{ width: '24px', height: '2px', background: step > i ? '#1A5BA6' : '#ddd' }} />}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700,
                background: step === i + 1 ? '#1A5BA6' : step > i + 1 ? '#2E7D32' : '#eee',
                color: step >= i + 1 ? '#fff' : '#999',
              }}>{step > i + 1 ? '✓' : s}</div>
            </div>
          ))}
          <div style={{ marginLeft: '8px', fontSize: '13px', color: '#666' }}>
            {step === 1 ? 'Upload & Recipient' : step === 2 ? 'Place Fields' : 'Sent!'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '8px', padding: '12px 16px', color: '#C62828', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* STEP 1: Upload + Recipient */}
      {step === 1 && (
        <div style={{ maxWidth: '560px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: '#333', fontSize: '14px' }}>
              Recipient Name *
            </label>
            <input
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Full name"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: '#333', fontSize: '14px' }}>
              Recipient Email *
            </label>
            <input
              type="email"
              value={signerEmail}
              onChange={e => setSignerEmail(e.target.value)}
              placeholder="email@example.com"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: '#333', fontSize: '14px' }}>
              Document Title *
            </label>
            <input
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
              placeholder="e.g. Rental911 Consulting Agreement"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          {/* PDF Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('pdfInput')?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1A5BA6' : '#ccc'}`,
              borderRadius: '10px',
              padding: '40px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? '#EEF4FF' : '#fafafa',
              transition: 'all 0.2s',
              marginBottom: '24px',
            }}
          >
            <input
              id="pdfInput" type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
            />
            {file ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                <div style={{ fontWeight: 700, color: '#222' }}>{file.name}</div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
                  {(file.size / 1024).toFixed(0)} KB · Click to change
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>⬆️</div>
                <div style={{ fontWeight: 600, color: '#333' }}>Drop your PDF here or click to browse</div>
                <div style={{ fontSize: '13px', color: '#999', marginTop: '6px' }}>PDF files only</div>
              </div>
            )}
          </div>

          <button
            disabled={!file || !signerName.trim() || !signerEmail.trim() || !docTitle.trim()}
            onClick={() => setStep(2)}
            style={{
              background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '12px 32px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              opacity: (!file || !signerName.trim() || !signerEmail.trim() || !docTitle.trim()) ? 0.5 : 1,
            }}
          >
            Next: Place Signature Fields →
          </button>
        </div>
      )}

      {/* STEP 2: Place Fields */}
      {step === 2 && (
        <div style={{ display: 'flex', gap: '24px', flex: 1, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ width: '200px', flexShrink: 0 }}>
            <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '16px' }}>
              <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '13px', color: '#555' }}>
                FIELD TYPE
              </p>
              {(['signature', 'initials', 'date'] as Field['type'][]).map(type => (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  style={{
                    width: '100%', padding: '10px', marginBottom: '8px', border: '2px solid',
                    borderColor: activeType === type ? FIELD_COLORS[type] : '#ddd',
                    borderRadius: '6px', background: activeType === type ? FIELD_COLORS[type] : '#fff',
                    color: activeType === type ? '#fff' : '#444',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  {FIELD_LABELS[type]}
                </button>
              ))}

              <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }} />

              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '13px', color: '#555' }}>
                PAGE
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => { if (currentPage > 1) renderPage(currentPage - 1); }}
                  disabled={currentPage <= 1}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}
                >‹</button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#444' }}>
                  {currentPage} / {totalPages || '...'}
                </span>
                <button
                  onClick={() => { if (currentPage < totalPages) renderPage(currentPage + 1); }}
                  disabled={currentPage >= totalPages}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}
                >›</button>
              </div>

              <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }} />

              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '13px', color: '#555' }}>
                FIELDS ({fields.length})
              </p>
              {fields.filter(f => f.page === currentPage).length === 0 ? (
                <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>
                  Click on the document to place fields
                </p>
              ) : (
                fields.filter(f => f.page === currentPage).map(f => (
                  <div key={f.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 8px', marginBottom: '4px', background: '#fff',
                    border: `1px solid ${FIELD_COLORS[f.type]}`, borderRadius: '4px', fontSize: '12px',
                  }}>
                    <span style={{ color: FIELD_COLORS[f.type], fontWeight: 700 }}>
                      {FIELD_LABELS[f.type]}
                    </span>
                    <button
                      onClick={() => removeField(f.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '14px', padding: 0 }}
                    >×</button>
                  </div>
                ))
              )}

              <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }} />

              <button
                onClick={handleSend}
                disabled={sending || fields.length === 0}
                style={{
                  width: '100%', background: '#2E7D32', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', opacity: (sending || fields.length === 0) ? 0.5 : 1,
                }}
              >
                {sending ? 'Sending…' : `Send for Signature →`}
              </button>
              {fields.length === 0 && (
                <p style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', margin: '8px 0 0' }}>
                  Place at least one field first
                </p>
              )}
            </div>
          </div>

          {/* PDF Canvas */}
          <div style={{ flex: 1, overflow: 'auto', background: '#888', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'center' }}>
            {!pdfReady && (
              <div style={{ color: '#fff', alignSelf: 'center', fontSize: '16px' }}>Loading PDF…</div>
            )}
            <div style={{ position: 'relative', display: pdfReady ? 'block' : 'none', cursor: 'crosshair' }}>
              <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} />
              <div
                ref={overlayRef}
                onClick={handleOverlayClick}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                {fields.filter(f => f.page === currentPage).map(f => (
                  <div
                    key={f.id}
                    onClick={e => { e.stopPropagation(); removeField(f.id); }}
                    title="Click to remove"
                    style={{
                      position: 'absolute',
                      left:   `${f.xPct * 100}%`,
                      top:    `${f.yPct * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      background: FIELD_COLORS[f.type] + 'CC',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      userSelect: 'none',
                      border: `2px solid ${FIELD_COLORS[f.type]}`,
                    }}
                  >
                    {FIELD_LABELS[f.type]} ×
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Sent confirmation */}
      {step === 3 && (
        <div style={{ maxWidth: '520px', textAlign: 'center', paddingTop: '60px' }}>
          <div style={{ fontSize: '72px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ color: '#2E7D32', margin: '0 0 12px' }}>Document Sent!</h2>
          <p style={{ color: '#444', lineHeight: 1.6, margin: '0 0 8px' }}>
            <strong>{signerName}</strong> ({signerEmail}) has been emailed a link to sign
            <strong> {docTitle}</strong>.
          </p>
          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 32px' }}>
            You'll receive an email with the signed copy as soon as they complete it.
            It also shows up in the Documents list.
          </p>
          {sentUrl && (
            <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', wordBreak: 'break-all' }}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888', fontWeight: 700 }}>SIGNING LINK</p>
              <a href={sentUrl} target="_blank" rel="noreferrer" style={{ color: '#1A5BA6', fontSize: '13px' }}>{sentUrl}</a>
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => { setView('list'); resetPrepare(); window.location.reload(); }}
              style={{
                background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px',
                padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
              }}
            >
              View All Documents
            </button>
            <button
              onClick={resetPrepare}
              style={{
                background: '#fff', color: '#1A5BA6', border: '2px solid #1A5BA6', borderRadius: '8px',
                padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
              }}
            >
              Send Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
