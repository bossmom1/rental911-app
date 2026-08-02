'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Field = {
  id: string;
  type: 'signature' | 'initials' | 'date';
  page: number;
  xPct: number;
  yPct: number;
};

type Props = {
  token: string;
  pdfUrl: string;
  fields: Field[];
  signerName: string;
  documentTitle: string;
};

const FIELD_COLORS: Record<Field['type'], string> = {
  signature: '#1A5BA6',
  initials:  '#2E7D32',
  date:      '#E65100',
};

export default function SignClient({ token, pdfUrl, fields, signerName, documentTitle }: Props) {
  const [currentPage, setCurrentPage]     = useState(1);
  const [totalPages, setTotalPages]       = useState(0);
  const [pdfReady, setPdfReady]           = useState(false);
  const [filledFields, setFilledFields]   = useState<Record<string, string>>({});  // fieldId → data URL or text
  const [modalField, setModalField]       = useState<Field | null>(null);
  const [initialsText, setInitialsText]   = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [error, setError]                 = useState('');

  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayRef    = useRef<HTMLDivElement>(null);
  const sigPadRef     = useRef<any>(null);
  const sigCanvasRef  = useRef<HTMLCanvasElement>(null);
  const pdfDocRef     = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfBytesRef   = useRef<Uint8Array | null>(null);

  // Load PDF.js + pdf-lib + signature_pad
  useEffect(() => {
    const loadScript = (src: string) => new Promise<void>((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      document.head.appendChild(s);
    });

    (async () => {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/signature_pad/4.1.7/signature_pad.umd.min.js');
      await loadPdf();
    })();
  }, []);

  const loadPdf = async () => {
    const pdfjsLib = (window as any).pdfjsLib;
    const resp = await fetch(pdfUrl);
    const raw  = await resp.arrayBuffer();
    pdfBytesRef.current = new Uint8Array(raw);
    const doc = await pdfjsLib.getDocument({ data: pdfBytesRef.current.slice() }).promise;
    pdfDocRef.current = doc;
    setTotalPages(doc.numPages);
    await renderPage(1);
    setPdfReady(true);

    // Auto-fill date fields
    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const updates: Record<string, string> = {};
    fields.forEach(f => { if (f.type === 'date') updates[f.id] = today; });
    if (Object.keys(updates).length) setFilledFields(prev => ({ ...prev, ...updates }));
  };

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (renderTaskRef.current) renderTaskRef.current.cancel();
    const page     = await pdfDocRef.current.getPage(pageNum);
    const scale    = Math.min(1.4, (window.innerWidth * 0.85) / page.getViewport({ scale: 1 }).width);
    const viewport = page.getViewport({ scale });
    const canvas   = canvasRef.current;
    const ctx      = canvas.getContext('2d')!;
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    if (overlayRef.current) {
      overlayRef.current.style.width  = `${viewport.width}px`;
      overlayRef.current.style.height = `${viewport.height}px`;
    }
    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* cancelled */ }
    setCurrentPage(pageNum);
  }, []);

  // Initialise signature pad when modal opens
  useEffect(() => {
    if (modalField?.type !== 'signature' || !sigCanvasRef.current) return;
    const SignaturePad = (window as any).SignaturePad;
    if (!SignaturePad) return;
    if (sigPadRef.current) sigPadRef.current.off();
    sigPadRef.current = new SignaturePad(sigCanvasRef.current, {
      backgroundColor: 'rgba(255,255,255,0)',
      penColor: '#000',
    });
  }, [modalField]);

  const openFieldModal = (f: Field) => {
    if (filledFields[f.id]) return; // already filled — could allow re-sign if needed
    if (f.type === 'date') return;   // auto-filled
    setModalField(f);
    setInitialsText('');
  };

  const confirmField = () => {
    if (!modalField) return;
    if (modalField.type === 'signature') {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) { setError('Please draw your signature.'); return; }
      const dataUrl = sigPadRef.current.toDataURL('image/png');
      setFilledFields(prev => ({ ...prev, [modalField.id]: dataUrl }));
    } else if (modalField.type === 'initials') {
      if (!initialsText.trim()) { setError('Please enter your initials.'); return; }
      setFilledFields(prev => ({ ...prev, [modalField.id]: initialsText.trim().toUpperCase() }));
    }
    setError('');
    setModalField(null);
  };

  const allFilled = fields.every(f => filledFields[f.id]);

  const handleSubmit = async () => {
    if (!pdfBytesRef.current) return;
    setSubmitting(true);
    setError('');

    try {
      const { PDFDocument, rgb } = (window as any).PDFLib;
      const pdfLibDoc = await PDFDocument.load(pdfBytesRef.current.slice(), { ignoreEncryption: true });
      const helvetica = await pdfLibDoc.embedFont('Helvetica');
      const pdfPages  = pdfLibDoc.getPages();

      for (const field of fields) {
        const pageObj   = pdfPages[field.page - 1];
        const { width, height } = pageObj.getSize();
        const pdfX = field.xPct * width;
        const pdfY = (1 - field.yPct) * height;
        const value = filledFields[field.id];
        if (!value) continue;

        if (field.type === 'signature') {
          // Decode data URL to bytes
          const base64 = value.split(',')[1];
          const binary = atob(base64);
          const imgBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) imgBytes[i] = binary.charCodeAt(i);
          const img = await pdfLibDoc.embedPng(imgBytes);
          const dims = img.scaleToFit(120, 40);
          pageObj.drawImage(img, { x: pdfX - dims.width / 2, y: pdfY - dims.height / 2, ...dims });
          // Date below signature
          const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
          pageObj.drawText(today, { x: pdfX - dims.width / 2, y: pdfY - dims.height / 2 - 12, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
        } else if (field.type === 'initials') {
          pageObj.drawText(value, { x: pdfX - 12, y: pdfY - 8, size: 14, font: helvetica, color: rgb(0, 0, 0) });
        } else if (field.type === 'date') {
          pageObj.drawText(value, { x: pdfX - 40, y: pdfY - 8, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
        }
      }

      const signedBytes = await pdfLibDoc.save();
      const blob = new Blob([signedBytes], { type: 'application/pdf' });
      const fd   = new FormData();
      fd.append('signedPdf', blob, 'signed.pdf');

      const res = await fetch(`/api/signing/${token}/complete`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Submission failed. Please try again.');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  // ── SUCCESS STATE ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', textAlign: 'center', padding: '24px' }}>
        <div style={{ fontSize: '72px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: '#2E7D32', margin: '0 0 12px' }}>Document Signed!</h2>
        <p style={{ color: '#444', maxWidth: '440px', lineHeight: 1.6, margin: '0 0 8px' }}>
          Thank you, <strong>{signerName}</strong>. Your signed copy of <strong>{documentTitle}</strong> has been submitted.
        </p>
        <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>
          A copy will be emailed to you and to Christine Pollard shortly.
        </p>
      </div>
    );
  }

  // ── SIGN PAGE ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: '#f0f0f0' }}>
      {/* Header */}
      <div style={{ background: '#1A5BA6', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>
            Rental<span style={{ color: '#F5A623' }}>911</span>
          </span>
          <span style={{ color: '#c8d8f0', fontSize: '13px', marginLeft: '16px' }}>Document Signing</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{documentTitle}</div>
          <div style={{ color: '#c8d8f0', fontSize: '12px' }}>Hi, {signerName}</div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: '#FFF8E1', borderBottom: '1px solid #FFE082', padding: '12px 24px', fontSize: '14px', color: '#5D4037' }}>
        <strong>Click each highlighted field</strong> on the document to sign or initial. All fields must be completed before you can submit.
        &nbsp;({Object.keys(filledFields).length}/{fields.length} completed)
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', padding: '10px 24px', fontSize: '14px', color: '#C62828', borderBottom: '1px solid #FFCDD2' }}>
          {error}
        </div>
      )}

      {/* PDF Viewer */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px', overflow: 'auto' }}>
        {!pdfReady && (
          <div style={{ color: '#666', fontSize: '16px', paddingTop: '60px' }}>Loading document…</div>
        )}
        <div style={{ position: 'relative', display: pdfReady ? 'block' : 'none' }}>
          <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }} />
          <div ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0 }}>
            {fields.filter(f => f.page === currentPage).map(f => {
              const filled = !!filledFields[f.id];
              return (
                <div
                  key={f.id}
                  onClick={() => openFieldModal(f)}
                  style={{
                    position: 'absolute',
                    left:      `${f.xPct * 100}%`,
                    top:       `${f.yPct * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    background: filled ? FIELD_COLORS[f.type] + '22' : FIELD_COLORS[f.type],
                    border:    `2px solid ${FIELD_COLORS[f.type]}`,
                    borderRadius: '4px',
                    padding:   '4px 12px',
                    minWidth:  '80px',
                    textAlign: 'center',
                    cursor:    f.type === 'date' ? 'default' : 'pointer',
                    userSelect: 'none',
                    animation: filled ? 'none' : 'pulse 1.5s infinite',
                  }}
                >
                  {filled ? (
                    f.type === 'signature' ? (
                      <img src={filledFields[f.id]} alt="signature" style={{ height: '32px', maxWidth: '100px', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ color: FIELD_COLORS[f.type], fontWeight: 700, fontSize: '13px' }}>{filledFields[f.id]}</span>
                    )
                  ) : (
                    <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                      {f.type === 'signature' ? 'CLICK TO SIGN' : f.type === 'initials' ? 'INITIALS' : 'DATE'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center', paddingBottom: '16px' }}>
          <button
            onClick={() => renderPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}
          >‹ Prev</button>
          <span style={{ color: '#666', fontSize: '14px' }}>Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => renderPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}
          >Next ›</button>
        </div>
      )}

      {/* Submit button */}
      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #eee', padding: '16px 24px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleSubmit}
          disabled={!allFilled || submitting || !pdfReady}
          style={{
            background: allFilled ? '#2E7D32' : '#ccc',
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '14px 48px', fontSize: '16px', fontWeight: 700,
            cursor: allFilled && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Submitting…' : allFilled ? 'Submit Signed Document →' : `Complete All Fields to Submit (${Object.keys(filledFields).length}/${fields.length})`}
        </button>
      </div>

      {/* Signature Modal */}
      {modalField && (
        <div
          onClick={() => { setModalField(null); setError(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}
          >
            <h3 style={{ margin: '0 0 16px', color: '#1A5BA6', fontSize: '18px' }}>
              {modalField.type === 'signature' ? 'Draw Your Signature' : 'Enter Your Initials'}
            </h3>

            {modalField.type === 'signature' && (
              <>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666' }}>
                  Use your mouse or finger to sign in the box below.
                </p>
                <div style={{ border: '2px solid #1A5BA6', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                  <canvas ref={sigCanvasRef} width={400} height={150} style={{ display: 'block', width: '100%' }} />
                </div>
                <button
                  onClick={() => sigPadRef.current?.clear()}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: '13px', cursor: 'pointer', marginTop: '6px', padding: 0 }}
                >
                  Clear
                </button>
              </>
            )}

            {modalField.type === 'initials' && (
              <>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666' }}>
                  Type your initials (e.g. CP for Christine Pollard).
                </p>
                <input
                  autoFocus
                  value={initialsText}
                  onChange={e => setInitialsText(e.target.value.toUpperCase().slice(0, 4))}
                  maxLength={4}
                  placeholder="e.g. DF"
                  style={{
                    width: '100%', padding: '14px', fontSize: '28px', fontWeight: 700,
                    textAlign: 'center', border: '2px solid #2E7D32', borderRadius: '8px',
                    boxSizing: 'border-box', letterSpacing: '8px',
                  }}
                />
              </>
            )}

            {error && (
              <p style={{ color: '#C62828', fontSize: '13px', marginTop: '8px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => { setModalField(null); setError(''); }}
                style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmField}
                style={{ flex: 2, padding: '12px', border: 'none', borderRadius: '8px', background: FIELD_COLORS[modalField.type], color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '15px' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
      `}</style>
    </div>
  );
}
