'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
type FieldSigner = 'admin' | number;   // number = recipient index (0-based)

type Field = {
  id: string;
  type: 'signature' | 'initials' | 'date' | 'text';
  page: number;
  xPct: number;
  yPct: number;
  signer: FieldSigner;
};

type Recipient = { name: string; email: string };

type SigningRequest = {
  id: string;
  token: string;
  document_title: string;
  signer_name: string;
  signer_email: string;
  status: 'pending' | 'signed' | 'expired';
  created_at: string;
  signed_at: string | null;
  session_id: string | null;
  recipient_index: number | null;
};

// ── Recipient colors ────────────────────────────────────────────────────────
const RECIPIENT_COLORS = [
  { color: '#D97706', light: '#FEF3C7' },   // Amber
  { color: '#059669', light: '#D1FAE5' },   // Green
  { color: '#7C3AED', light: '#EDE9FE' },   // Purple
  { color: '#E11D48', light: '#FFE4E6' },   // Rose
];

const TYPE_ICON: Record<Field['type'], string> = {
  signature: '✍️',
  initials:  '🔤',
  date:      '📅',
  text:      '📝',
};

const SIG_FONTS = [
  { label: 'Elegant',  family: '"Dancing Script", cursive', size: 46, weight: '700' },
  { label: 'Classic',  family: '"Great Vibes", cursive',    size: 50, weight: '400' },
  { label: 'Formal',   family: '"Pinyon Script", cursive',  size: 44, weight: '400' },
];

async function renderFontSig(name: string, fontFamily: string, fontSize: number, weight: string): Promise<string> {
  const spec = `${weight} ${fontSize}px ${fontFamily}`;
  try { await (document as any).fonts.load(spec, name); } catch { /* fallback */ }
  const canvas = document.createElement('canvas');
  canvas.width = 420; canvas.height = 100;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 420, 100);
  ctx.fillStyle = '#111';
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 210, 52);
  return canvas.toDataURL('image/png');
}

// ── Helper: signer config ──────────────────────────────────────────────────
function getSignerConfig(signer: FieldSigner, recipients: Recipient[]) {
  if (signer === 'admin') {
    return { color: '#1A5BA6', light: '#EBF3FF', icon: '✏️', label: 'You' };
  }
  const idx = signer as number;
  const rc  = RECIPIENT_COLORS[idx] ?? RECIPIENT_COLORS[0];
  return { ...rc, icon: '👤', label: recipients[idx]?.name || `Recipient ${idx + 1}` };
}

export default function DocumentsClient({ requests }: { requests: SigningRequest[] }) {
  const [view, setView]             = useState<'list' | 'prepare'>('list');
  const [step, setStep]             = useState<1 | 2 | 3>(1);
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: '', email: '' }]);
  const [docTitle, setDocTitle]     = useState('');
  const [file, setFile]             = useState<File | null>(null);
  const [fields, setFields]         = useState<Field[]>([]);
  const [activeType, setActiveType] = useState<Field['type']>('signature');
  const [activeSigner, setActiveSigner]           = useState<FieldSigner>(0);
  const [editingRecipientIdx, setEditingRecipientIdx] = useState<number | null>(null);
  const [currentPage, setCurrentPage]   = useState(1);
  const [totalPages, setTotalPages]     = useState(0);
  const [pdfReady, setPdfReady]         = useState(false);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState('');
  const [sentUrls, setSentUrls]         = useState<string[]>([]);
  const [dragOver, setDragOver]         = useState(false);
  const [emailNote, setEmailNote]       = useState('');

  // Admin signing modal
  const [showAdminSign, setShowAdminSign] = useState(false);
  const [adminInitials, setAdminInitials] = useState('');
  const [adminSigName,  setAdminSigName]  = useState('Christine Pollard');
  const [adminFontIdx,  setAdminFontIdx]  = useState(-1);

  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayRef    = useRef<HTMLDivElement>(null);
  const pdfDocRef     = useRef<any>(null);
  const pdfBytesRef   = useRef<Uint8Array | null>(null);
  const renderTaskRef = useRef<any>(null);

  const draggingRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const didDragRef  = useRef(false);

  // ── Load CDN scripts ───────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('sig-fonts-css')) {
      const link = document.createElement('link');
      link.id = 'sig-fonts-css';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Pinyon+Script&display=swap';
      document.head.appendChild(link);
    }
    [
      { key: 'pdfjsLib', src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' },
      { key: 'PDFLib',   src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js' },
    ].forEach(({ key, src }) => {
      if ((window as any)[key]) return;
      const s = document.createElement('script');
      s.src = src;
      if (key === 'pdfjsLib') {
        s.onload = () => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        };
      }
      document.head.appendChild(s);
    });
  }, []);

  // ── Render PDF page ────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (renderTaskRef.current) renderTaskRef.current.cancel();
    const page  = await pdfDocRef.current.getPage(pageNum);
    const scale = Math.min(1.4, (window.innerWidth * 0.6) / page.getViewport({ scale: 1 }).width);
    const vp    = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d')!;
    canvas.width  = vp.width;
    canvas.height = vp.height;
    if (overlayRef.current) {
      overlayRef.current.style.width  = `${vp.width}px`;
      overlayRef.current.style.height = `${vp.height}px`;
    }
    const task = page.render({ canvasContext: ctx, viewport: vp });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* cancelled */ }
    setCurrentPage(pageNum);
  }, []);

  useEffect(() => {
    if (!file || step !== 2) return;
    const tryLoad = async () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) { setTimeout(tryLoad, 300); return; }
      const raw = await file.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(raw);
      const doc = await lib.getDocument({ data: pdfBytesRef.current.slice() }).promise;
      pdfDocRef.current = doc;
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      await renderPage(1);
      setPdfReady(true);
    };
    tryLoad();
  }, [file, step, renderPage]);

  // ── Field drag handlers ────────────────────────────────────────────────
  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect  = overlay.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    draggingRef.current = {
      id: fieldId,
      offX: (e.clientX - rect.left) - field.xPct * rect.width,
      offY: (e.clientY - rect.top)  - field.yPct * rect.height,
    };
    didDragRef.current = false;
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    didDragRef.current = true;
    const rect = overlay.getBoundingClientRect();
    const xPct = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left - draggingRef.current.offX) / rect.width));
    const yPct = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top  - draggingRef.current.offY) / rect.height));
    setFields(prev => prev.map(f =>
      f.id === draggingRef.current!.id ? { ...f, xPct, yPct } : f
    ));
  };

  const handleOverlayMouseUp = () => { draggingRef.current = null; };

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    setFields(prev => [...prev, {
      id: `f-${Date.now()}`,
      type: activeType,
      page: currentPage,
      xPct: (e.clientX - rect.left) / rect.width,
      yPct: (e.clientY - rect.top)  / rect.height,
      signer: activeSigner,
    }]);
  }, [activeType, currentPage, activeSigner]);

  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id));

  // ── File handling ──────────────────────────────────────────────────────
  const handleFileSelect = (f: File) => {
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setFile(f);
    if (!docTitle) setDocTitle(f.name.replace(/\.pdf$/i, ''));
    setError('');
  };

  // ── Send flow ──────────────────────────────────────────────────────────
  const handleSend = () => {
    const adminFields = fields.filter(f => f.signer === 'admin');
    if (adminFields.length > 0) { setShowAdminSign(true); return; }
    doSubmit(null, fields.filter(f => f.signer !== 'admin'));
  };

  const handleAdminSignDone = async () => {
    let sigDataUrl: string | null = null;
    if (adminFontIdx >= 0 && adminSigName.trim()) {
      const f = SIG_FONTS[adminFontIdx];
      sigDataUrl = await renderFontSig(adminSigName.trim(), f.family, f.size, f.weight);
    }
    setShowAdminSign(false);
    const adminFields    = fields.filter(f => f.signer === 'admin');
    const recipientFields = fields.filter(f => f.signer !== 'admin');
    const preSigned = await embedAdminSigs(file!, adminFields, sigDataUrl, adminInitials);
    doSubmit(preSigned, recipientFields);
  };

  const embedAdminSigs = async (
    src: File,
    adminFields: Field[],
    sigDataUrl: string | null,
    initials: string,
  ): Promise<Blob> => {
    const PDFLib = (window as any).PDFLib;
    if (!PDFLib || adminFields.length === 0) return src;
    const buf    = await src.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(buf);
    const pages  = pdfDoc.getPages();
    const font   = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const today  = new Date().toLocaleDateString('en-US');

    let sigImg: any = null;
    if (sigDataUrl) {
      const raw = Uint8Array.from(atob(sigDataUrl.split(',')[1]), c => c.charCodeAt(0));
      sigImg = await pdfDoc.embedPng(raw);
    }

    for (const field of adminFields) {
      const pg = pages[field.page - 1];
      if (!pg) continue;
      const { width, height } = pg.getSize();
      const cx = field.xPct * width;
      const cy = (1 - field.yPct) * height;

      if (field.type === 'signature' && sigImg) {
        const sw = 160, sh = 50;
        pg.drawImage(sigImg, { x: cx - sw / 2, y: cy - sh / 2, width: sw, height: sh });
        pg.drawText(today, { x: cx - sw / 2, y: cy - sh / 2 - 13, size: 8, font, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      } else if (field.type === 'initials' && initials) {
        pg.drawText(initials.toUpperCase().slice(0, 4), { x: cx - 18, y: cy - 4, size: 18, font, color: PDFLib.rgb(0.1, 0.36, 0.65) });
        pg.drawText(today, { x: cx - 28, y: cy - 18, size: 7, font, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      } else if (field.type === 'date') {
        pg.drawText(today, { x: cx - 35, y: cy - 7, size: 11, font, color: PDFLib.rgb(0.2, 0.2, 0.2) });
      } else if (field.type === 'text') {
        const txt = (field as any).value || '';
        if (txt) pg.drawText(txt, { x: cx - 40, y: cy - 7, size: 11, font, color: PDFLib.rgb(0.1, 0.1, 0.1) });
      }
    }

    const bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  };

  const doSubmit = async (preSigned: Blob | null, recipientFields: Field[]) => {
    if (!file) return;
    setSending(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', preSigned ?? file, 'document.pdf');
      fd.append('recipients',    JSON.stringify(recipients));
      fd.append('documentTitle', docTitle);
      fd.append('emailNote',     emailNote);
      // Fields retain signer (number = recipient index) so API can split them per recipient
      fd.append('fields', JSON.stringify(recipientFields));
      const res  = await fetch('/api/signing/create', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send'); return; }
      setSentUrls(data.signingUrls ?? [data.signingUrl].filter(Boolean));
      setStep(3);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSending(false);
    }
  };

  const resetPrepare = () => {
    setStep(1); setFile(null); setFields([]);
    setRecipients([{ name: '', email: '' }]);
    setDocTitle(''); setSentUrls([]); setError('');
    setPdfReady(false); pdfDocRef.current = null; pdfBytesRef.current = null;
    setActiveSigner(0); setAdminInitials(''); setEmailNote(''); setAdminFontIdx(-1); setEditingRecipientIdx(null);
  };

  // ── LIST VIEW ─────────────────────────────────────────────────────────
  if (view === 'list') {
    // Group requests by session_id (fall back to id for legacy single-recipient rows)
    const sessionMap = new Map<string, SigningRequest[]>();
    requests.forEach(r => {
      const key = r.session_id ?? r.id;
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push(r);
    });

    return (
      <div style={{ padding: '32px', fontFamily: 'sans-serif', maxWidth: '900px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1A5BA6' }}>Document Signing</h1>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>Send documents to clients for electronic signature</p>
          </div>
          <button
            onClick={() => { setView('prepare'); setStep(1); }}
            style={{ background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
          >
            + New Document
          </button>
        </div>

        {requests.length === 0 ? (
          <div style={{ border: '2px dashed #ddd', borderRadius: '12px', padding: '64px', textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <p style={{ margin: 0, fontSize: '16px' }}>No documents sent yet.</p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>Click "New Document" to send your first signing request.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                {['Document', 'Recipients', 'Status', 'Sent', 'Completed'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#888', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(sessionMap.values()).map(reqs => {
                const first      = reqs[0];
                const allSigned  = reqs.every(r => r.status === 'signed');
                const signedCnt  = reqs.filter(r => r.status === 'signed').length;
                const isMulti    = reqs.length > 1;
                const lastSigned = reqs.reduce<string | null>((acc, r) => {
                  if (!r.signed_at) return acc;
                  return !acc || r.signed_at > acc ? r.signed_at : acc;
                }, null);

                return (
                  <tr key={first.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#222' }}>{first.document_title}</td>
                    <td style={{ padding: '12px', color: '#444' }}>
                      {isMulti ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {reqs.map((r, i) => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                                background: r.status === 'signed' ? '#2E7D32' : '#E65100',
                              }} />
                              <span style={{ fontSize: '13px' }}>{r.signer_name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div>{first.signer_name}</div>
                          <div style={{ fontSize: '12px', color: '#888' }}>{first.signer_email}</div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                        fontSize: '12px', fontWeight: 700,
                        background: allSigned ? '#E8F5E9' : '#FFF3E0',
                        color:      allSigned ? '#2E7D32' : '#E65100',
                      }}>
                        {allSigned
                          ? (isMulti ? `✅ All Signed` : '✅ Signed')
                          : isMulti
                          ? `⏳ ${signedCnt}/${reqs.length} Signed`
                          : '⏳ Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>{new Date(first.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                      {allSigned && lastSigned ? new Date(lastSigned).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── PREPARE VIEW ──────────────────────────────────────────────────────
  const adminFields = fields.filter(f => f.signer === 'admin');
  const step1Valid  = !!file && !!docTitle.trim() &&
                      recipients.length > 0 &&
                      recipients.every(r => r.name.trim() && r.email.trim());

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'sans-serif', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button onClick={() => { setView('list'); resetPrepare(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A5BA6', fontSize: '14px', padding: 0 }}>
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#222' }}>Prepare Document for Signing</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {i > 0 && <div style={{ width: '24px', height: '2px', background: step > i ? '#1A5BA6' : '#ddd' }} />}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700,
                background: step === s ? '#1A5BA6' : step > s ? '#2E7D32' : '#eee',
                color: step >= s ? '#fff' : '#999',
              }}>{step > s ? '✓' : s}</div>
            </div>
          ))}
          <div style={{ marginLeft: '8px', fontSize: '13px', color: '#666' }}>
            {step === 1 ? 'Upload & Recipients' : step === 2 ? 'Place Fields' : 'Sent!'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '8px', padding: '12px 16px', color: '#C62828', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div style={{ maxWidth: '600px' }}>
          {/* Document title */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', color: '#333', fontSize: '14px' }}>Document Title *</label>
            <input
              type="text" value={docTitle} onChange={e => setDocTitle(e.target.value)}
              placeholder="e.g. Rental911 Consulting Agreement"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Recipients */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontWeight: 700, color: '#333', fontSize: '14px' }}>
                Recipients * <span style={{ fontWeight: 400, color: '#888', fontSize: '12px' }}>({recipients.length} of 4 max)</span>
              </label>
              {recipients.length < 4 && (
                <button
                  type="button"
                  onClick={() => setRecipients(prev => [...prev, { name: '', email: '' }])}
                  style={{ background: 'none', border: '1px solid #1A5BA6', color: '#1A5BA6', borderRadius: '6px', padding: '5px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Add Recipient
                </button>
              )}
            </div>
            {recipients.map((r, i) => {
              const rc = RECIPIENT_COLORS[i] ?? RECIPIENT_COLORS[0];
              return (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                  <div style={{ width: '4px', flexShrink: 0, alignSelf: 'stretch', background: rc.color, borderRadius: '3px' }} />
                  <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={r.name}
                      onChange={e => setRecipients(prev => prev.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))}
                      placeholder={`Recipient ${i + 1} name`}
                      style={{ flex: 1, padding: '9px 12px', border: `1px solid ${rc.color}44`, borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                    />
                    <input
                      type="email"
                      value={r.email}
                      onChange={e => setRecipients(prev => prev.map((p, idx) => idx === i ? { ...p, email: e.target.value } : p))}
                      placeholder="email@example.com"
                      style={{ flex: 1.2, padding: '9px 12px', border: `1px solid ${rc.color}44`, borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRecipients(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: '#bbb', fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* PDF upload */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
            onClick={() => document.getElementById('pdfInput')?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1A5BA6' : '#ccc'}`,
              borderRadius: '10px', padding: '40px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? '#EEF4FF' : '#fafafa', transition: 'all 0.2s', marginBottom: '24px',
            }}
          >
            <input id="pdfInput" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
            {file ? (
              <>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                <div style={{ fontWeight: 700, color: '#222' }}>{file.name}</div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>⬆️</div>
                <div style={{ fontWeight: 600, color: '#333' }}>Drop your PDF here or click to browse</div>
                <div style={{ fontSize: '13px', color: '#999', marginTop: '6px' }}>PDF files only</div>
              </>
            )}
          </div>

          <button
            disabled={!step1Valid}
            onClick={() => setStep(2)}
            style={{
              background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '12px 32px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              opacity: !step1Valid ? 0.4 : 1,
            }}
          >
            Next: Place Signature Fields →
          </button>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div style={{ display: 'flex', gap: '24px', flex: 1, overflow: 'hidden' }}>

          {/* Left toolbar */}
          <div style={{ width: '220px', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '16px' }}>

              {/* ── Signer toggle ── */}
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Placing fields for</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {/* Admin (You) */}
                {(() => {
                  const cfg = getSignerConfig('admin', recipients);
                  const isActive = activeSigner === 'admin';
                  const count = fields.filter(f => f.signer === 'admin').length;
                  return (
                    <button
                      key="admin"
                      onClick={() => setActiveSigner('admin')}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: '8px',
                        border: `2px solid ${cfg.color}`,
                        background: isActive ? cfg.color : cfg.light,
                        color: isActive ? '#fff' : cfg.color,
                        fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: isActive ? `0 2px 8px ${cfg.color}55` : 'none',
                      }}
                    >
                      <span>✏️ You</span>
                      {count > 0 && (
                        <span style={{ background: isActive ? 'rgba(255,255,255,0.35)' : cfg.color, color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {/* Each recipient */}
                {recipients.map((r, i) => {
                  const cfg = getSignerConfig(i, recipients);
                  const isActive = activeSigner === i;
                  const count = fields.filter(f => f.signer === i).length;
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveSigner(i)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: '8px',
                        border: `2px solid ${cfg.color}`,
                        background: isActive ? cfg.color : cfg.light,
                        color: isActive ? '#fff' : cfg.color,
                        fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: isActive ? `0 2px 8px ${cfg.color}55` : 'none',
                      }}
                    >
                      <span>👤 {r.name || `Recipient ${i + 1}`}</span>
                      {count > 0 && (
                        <span style={{ background: isActive ? 'rgba(255,255,255,0.35)' : cfg.color, color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* Add recipient inline */}
                {recipients.length < 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newIdx = recipients.length;
                      setRecipients(prev => [...prev, { name: '', email: '' }]);
                      setActiveSigner(newIdx);
                      setEditingRecipientIdx(newIdx);
                    }}
                    style={{
                      padding: '7px 12px', border: '1px dashed #bbb', borderRadius: '8px',
                      background: '#fff', color: '#888', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    + Add Recipient
                  </button>
                )}
                {/* Inline name/email editor for a newly added recipient */}
                {editingRecipientIdx !== null && recipients[editingRecipientIdx] !== undefined && (
                  <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '10px', marginTop: '2px' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, color: '#555' }}>
                      {RECIPIENT_COLORS[editingRecipientIdx] && (
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: RECIPIENT_COLORS[editingRecipientIdx].color, marginRight: '5px' }} />
                      )}
                      Recipient {editingRecipientIdx + 1} details
                    </p>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={recipients[editingRecipientIdx]?.name ?? ''}
                      onChange={e => setRecipients(prev => prev.map((p, idx) => idx === editingRecipientIdx ? { ...p, name: e.target.value } : p))}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '12px', marginBottom: '6px' }}
                    />
                    <input
                      type="email"
                      placeholder="email@example.com"
                      value={recipients[editingRecipientIdx]?.email ?? ''}
                      onChange={e => setRecipients(prev => prev.map((p, idx) => idx === editingRecipientIdx ? { ...p, email: e.target.value } : p))}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '12px', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setEditingRecipientIdx(null)}
                        style={{ flex: 1, padding: '5px', background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecipients(prev => prev.filter((_, idx) => idx !== editingRecipientIdx));
                          setEditingRecipientIdx(null);
                          setActiveSigner(0);
                        }}
                        style={{ padding: '5px 10px', background: '#fff', color: '#999', border: '1px solid #ddd', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Field type ── */}
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Field type</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {(['signature', 'initials', 'text'] as Field['type'][]).map(type => {
                  const cfg = getSignerConfig(activeSigner, recipients);
                  const isActive = activeType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setActiveType(type)}
                      style={{
                        padding: '8px 10px', border: `2px solid ${cfg.color}`,
                        borderRadius: '6px',
                        background: isActive ? cfg.color : '#fff',
                        color: isActive ? '#fff' : cfg.color,
                        fontWeight: 700, fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {TYPE_ICON[type]} {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  );
                })}
              </div>

              {/* ── Page nav ── */}
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Page</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                <button onClick={() => { if (currentPage > 1) renderPage(currentPage - 1); }} disabled={currentPage <= 1} style={{ padding: '5px 10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>‹</button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#444' }}>{currentPage} / {totalPages || '…'}</span>
                <button onClick={() => { if (currentPage < totalPages) renderPage(currentPage + 1); }} disabled={currentPage >= totalPages} style={{ padding: '5px 10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>›</button>
              </div>

              {/* ── Field list ── */}
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fields ({fields.length})</p>
              {fields.length === 0 && (
                <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>Click the document to place fields</p>
              )}
              {/* Admin fields */}
              {(() => {
                const sFields = fields.filter(f => f.signer === 'admin');
                if (!sFields.length) return null;
                const cfg = getSignerConfig('admin', recipients);
                return (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, marginBottom: '4px' }}>✏️ You</div>
                    {sFields.map(f => (
                      <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', marginBottom: '3px', background: cfg.light, border: `1px solid ${cfg.color}`, borderRadius: '4px', fontSize: '12px' }}>
                        <span style={{ color: cfg.color, fontWeight: 600 }}>{TYPE_ICON[f.type]} {f.type} p.{f.page}</span>
                        <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* Recipient fields */}
              {recipients.map((r, i) => {
                const sFields = fields.filter(f => f.signer === i);
                if (!sFields.length) return null;
                const cfg = getSignerConfig(i, recipients);
                return (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, marginBottom: '4px' }}>
                      👤 {r.name || `Recipient ${i + 1}`}
                    </div>
                    {sFields.map(f => (
                      <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', marginBottom: '3px', background: cfg.light, border: `1px solid ${cfg.color}`, borderRadius: '4px', fontSize: '12px' }}>
                        <span style={{ color: cfg.color, fontWeight: 600 }}>{TYPE_ICON[f.type]} {f.type} p.{f.page}</span>
                        <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div style={{ borderTop: '1px solid #eee', margin: '14px 0' }} />

              {/* Email note */}
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '12px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Personal note (optional)</p>
              <textarea
                value={emailNote}
                onChange={e => setEmailNote(e.target.value)}
                placeholder={`Hi ${recipients[0]?.name || '[Name]'},\n\nPlease review and sign at your earliest convenience.`}
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', resize: 'vertical', color: '#333', lineHeight: 1.5, fontFamily: 'sans-serif', marginBottom: '12px' }}
              />

              <button
                onClick={handleSend}
                disabled={sending || fields.length === 0}
                style={{
                  width: '100%', background: '#1A5BA6', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', opacity: (sending || fields.length === 0) ? 0.4 : 1,
                }}
              >
                {sending ? 'Processing…' : adminFields.length > 0 ? '✏️ Sign & Send →' : `📤 Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''} →`}
              </button>
              {adminFields.length > 0 && (
                <p style={{ fontSize: '11px', color: '#888', textAlign: 'center', margin: '6px 0 0', lineHeight: 1.5 }}>
                  You'll sign your {adminFields.length} field{adminFields.length !== 1 ? 's' : ''} first.
                </p>
              )}
            </div>
          </div>

          {/* PDF canvas */}
          <div style={{ flex: 1, overflow: 'auto', background: '#888', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'center' }}>
            {!pdfReady && <div style={{ color: '#fff', alignSelf: 'center', fontSize: '16px' }}>Loading PDF…</div>}
            <div style={{ position: 'relative', display: pdfReady ? 'block' : 'none' }}>
              <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} />
              <div
                ref={overlayRef}
                onClick={handleOverlayClick}
                onMouseMove={handleOverlayMouseMove}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseUp}
                style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
              >
                {fields.filter(f => f.page === currentPage).map(f => {
                  const cfg = getSignerConfig(f.signer, recipients);
                  return (
                    <div
                      key={f.id}
                      onMouseDown={e => handleFieldMouseDown(e, f.id)}
                      style={{
                        position: 'absolute',
                        left: `${f.xPct * 100}%`,
                        top:  `${f.yPct * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        background: cfg.color + 'DD',
                        color: '#fff',
                        padding: '4px 8px 4px 6px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'grab',
                        userSelect: 'none',
                        border: `2px solid ${cfg.color}`,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      <span style={{ cursor: 'grab', fontSize: '11px', opacity: 0.7 }}>⠿</span>
                      <span>{TYPE_ICON[f.type]} {f.type}</span>
                      <span style={{ fontSize: '9px', opacity: 0.8 }}>({cfg.label})</span>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); removeField(f.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.9)', fontSize: '14px', padding: '0 0 0 2px', lineHeight: 1, fontWeight: 900 }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div style={{ maxWidth: '540px', paddingTop: '60px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '72px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#2E7D32', margin: '0 0 12px' }}>
              {recipients.length > 1 ? 'Documents Sent!' : 'Document Sent!'}
            </h2>
            <p style={{ color: '#444', lineHeight: 1.6, margin: '0 0 8px' }}>
              {recipients.length === 1
                ? <><strong>{recipients[0].name}</strong> has been emailed a link to sign <strong>{docTitle}</strong>.</>
                : <><strong>{recipients.length} recipients</strong> have been emailed links to sign <strong>{docTitle}</strong>.</>
              }
            </p>
          </div>

          {recipients.length > 1 && (
            <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '16px', marginBottom: '24px' }}>
              {recipients.map((r, i) => {
                const rc = RECIPIENT_COLORS[i] ?? RECIPIENT_COLORS[0];
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < recipients.length - 1 ? '1px solid #eee' : 'none' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: rc.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#222', fontSize: '14px' }}>{r.name}</div>
                      <div style={{ color: '#888', fontSize: '12px' }}>{r.email}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#E65100', fontWeight: 600 }}>⏳ Awaiting</span>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 32px', textAlign: 'center' }}>
            You'll receive an email{recipients.length > 1 ? ' as each person signs' : ''} with the signed copy.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={() => { setView('list'); resetPrepare(); window.location.reload(); }} style={{ background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
              View All Documents
            </button>
            <button onClick={resetPrepare} style={{ background: '#fff', color: '#1A5BA6', border: '2px solid #1A5BA6', borderRadius: '8px', padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
              Send Another
            </button>
          </div>
        </div>
      )}

      {/* ── ADMIN SIGNING MODAL ── */}
      {showAdminSign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 6px', color: '#1A5BA6', fontSize: '20px' }}>
              {adminFields.some(f => f.type === 'signature') && adminFields.some(f => f.type === 'initials')
                ? 'Sign & Initial'
                : adminFields.some(f => f.type === 'signature')
                ? 'Choose Your Signature Style'
                : 'Add Your Initials'}
            </h2>
            <p style={{ margin: '0 0 18px', color: '#666', fontSize: '14px' }}>
              This will be embedded before {
                recipients.length === 1
                  ? recipients[0].name
                  : `${recipients.length} recipients`
              } receive{recipients.length === 1 ? 's' : ''} it.
            </p>

            {adminFields.some(f => f.type === 'signature') && (
              <>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>Your name</label>
                <input
                  value={adminSigName}
                  onChange={e => setAdminSigName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '14px' }}
                />
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>Choose a signature style</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {SIG_FONTS.map((f, i) => (
                    <div
                      key={f.label}
                      onClick={() => setAdminFontIdx(i)}
                      style={{
                        border: `2px solid ${adminFontIdx === i ? '#1A5BA6' : '#ddd'}`,
                        borderRadius: '8px', padding: '10px 20px', cursor: 'pointer',
                        background: adminFontIdx === i ? '#EBF3FF' : '#fafafa',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontFamily: f.family, fontSize: f.size * 0.75, fontWeight: f.weight as any, color: '#111', lineHeight: 1.2 }}>
                        {adminSigName || 'Your Name'}
                      </span>
                      <span style={{ fontSize: '11px', color: adminFontIdx === i ? '#1A5BA6' : '#aaa', fontWeight: 600 }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {adminFields.some(f => f.type === 'initials') && (
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>🔤 Initials</label>
                <input
                  value={adminInitials}
                  onChange={e => setAdminInitials(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="e.g. CP"
                  maxLength={4}
                  style={{ padding: '10px 16px', border: '2px solid #1A5BA6', borderRadius: '8px', fontSize: '22px', fontWeight: 700, color: '#1A5BA6', width: '130px', textTransform: 'uppercase', letterSpacing: '6px', textAlign: 'center' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setShowAdminSign(false)} style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', background: '#fff', fontWeight: 600 }}>Cancel</button>
              <button
                onClick={handleAdminSignDone}
                disabled={adminFields.some(f => f.type === 'signature') && adminFontIdx < 0}
                style={{ padding: '10px 28px', background: '#1A5BA6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '15px', opacity: (adminFields.some(f => f.type === 'signature') && adminFontIdx < 0) ? 0.4 : 1 }}
              >
                Apply & Send →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
