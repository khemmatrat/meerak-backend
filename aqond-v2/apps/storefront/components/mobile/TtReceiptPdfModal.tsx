'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { receiptPdfUrl } from '@/lib/orders';

/** Match receipt PDF page (9:16). */
const RECEIPT_ASPECT = 9 / 16;

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  buyerId: string;
};

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l4-4m-4 4L8 11M4 21h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TtReceiptPdfModal({ open, onClose, orderId, buyerId }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const blobRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderGenRef = useRef(0);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('tt-modal-open');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('tt-modal-open');
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !orderId) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setPdfBlob(null);
    setCanvasReady(false);
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
      setBlobUrl(null);
    }

    const url = receiptPdfUrl(orderId, buyerId);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `โหลดใบเสร็จไม่สำเร็จ (${res.status})`);
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        setPdfBlob(blob);
        const next = URL.createObjectURL(blob);
        blobRef.current = next;
        setBlobUrl(next);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'โหลดใบเสร็จไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, orderId, buyerId]);

  useEffect(() => {
    if (!blobUrl) return;

    let cancelled = false;
    pdfDocRef.current?.destroy();
    pdfDocRef.current = null;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument(blobUrl).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        pdfDocRef.current = pdf;
        setCanvasReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'แสดงใบเสร็จไม่สำเร็จ');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
      setCanvasReady(false);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (!canvasReady || !pdfDocRef.current) return;

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const cancelActiveRender = () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }
    };

    const renderPage = async () => {
      const gen = ++renderGenRef.current;
      const pdf = pdfDocRef.current;
      const vpEl = viewportRef.current;
      const cvs = canvasRef.current;
      if (!pdf || !vpEl || !cvs) return;

      const targetW = vpEl.clientWidth;
      const targetH = vpEl.clientHeight;
      if (targetW < 10 || targetH < 10) return;

      cancelActiveRender();
      if (gen !== renderGenRef.current) return;

      try {
        const page = await pdf.getPage(1);
        if (gen !== renderGenRef.current) return;

        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(targetW / base.width, targetH / base.height);
        const vp = page.getViewport({ scale });
        const ctx = cvs.getContext('2d');
        if (!ctx || gen !== renderGenRef.current) return;

        cvs.width = Math.floor(vp.width);
        cvs.height = Math.floor(vp.height);

        const task = page.render({ canvasContext: ctx, viewport: vp });
        renderTaskRef.current = task;
        await task.promise;

        if (gen === renderGenRef.current) {
          renderTaskRef.current = null;
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name === 'RenderingCancelledException') return;
        if (gen === renderGenRef.current) {
          setError(e instanceof Error ? e.message : 'แสดงใบเสร็จไม่สำเร็จ');
        }
      }
    };

    const scheduleRender = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        void renderPage();
      }, 80);
    };

    scheduleRender();
    const ro = new ResizeObserver(scheduleRender);
    ro.observe(viewport);

    return () => {
      renderGenRef.current += 1;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      ro.disconnect();
      cancelActiveRender();
    };
  }, [canvasReady]);

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    renderGenRef.current += 1;
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        /* ignore */
      }
      renderTaskRef.current = null;
    }
    pdfDocRef.current?.destroy();
    pdfDocRef.current = null;
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setBlobUrl(null);
    setPdfBlob(null);
    setCanvasReady(false);
    setError('');
    onClose();
  };

  const handleDownload = () => {
    if (!pdfBlob) return;
    const fileName = `receipt-${orderId.slice(-8)}.pdf`;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open || !mounted) return null;

  const showCanvas = !loading && !error && canvasReady && blobUrl;

  return createPortal(
    <div
      className="tt-receipt-pdf-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="ใบเสร็จ PDF"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="tt-receipt-pdf-panel" style={{ ['--receipt-aspect' as string]: String(RECEIPT_ASPECT) }}>
        <header className="tt-receipt-pdf-toolbar">
          <div className="tt-receipt-pdf-title">
            <span className="tt-receipt-pdf-title-icon" aria-hidden>
              🧾
            </span>
            <div>
              <strong>ใบเสร็จ</strong>
              <span>#{orderId.slice(-8)}</span>
            </div>
          </div>
          <div className="tt-receipt-pdf-actions">
            <button
              type="button"
              className="tt-receipt-pdf-icon-btn"
              aria-label="ดาวน์โหลดใบเสร็จ"
              title="ดาวน์โหลด"
              disabled={!pdfBlob}
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <DownloadIcon />
            </button>
            <button
              type="button"
              className="tt-receipt-pdf-icon-btn tt-receipt-pdf-close"
              aria-label="ปิด"
              title="ปิด"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="tt-receipt-pdf-body">
          {loading && <p className="tt-receipt-pdf-status">กำลังโหลดใบเสร็จ…</p>}
          {error && (
            <p className="tt-receipt-pdf-status tt-receipt-pdf-error" role="alert">
              {error}
            </p>
          )}
          {showCanvas && (
            <div ref={viewportRef} className="tt-receipt-pdf-viewport">
              <canvas ref={canvasRef} className="tt-receipt-pdf-canvas" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
