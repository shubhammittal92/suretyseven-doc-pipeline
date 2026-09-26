import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getDocument,
  getHistory,
  DocumentDto,
  HistoryEntry,
} from '../api/client';
import { StatusBadge, fmtDate, fmtCurrency } from '../components/ui';

export default function DetailPage() {
  const { id = '' } = useParams();
  const [doc, setDoc] = useState<DocumentDto | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [d, h] = await Promise.all([getDocument(id), getHistory(id)]);
        setDoc(d);
        setHistory(h);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Poll while non-terminal so the user watches the lifecycle live.
  useEffect(() => {
    if (!doc) return;
    if (doc.status === 'PROCESSED' || doc.status === 'FAILED') return;
    const t = setInterval(() => load(true), 1500);
    return () => clearInterval(t);
  }, [doc, load]);

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="card">
          <div className="skeleton" style={{ width: '40%', height: 22, marginBottom: 16 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ margin: '10px 0' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="card center-state">
          Document not found.
          <br />
          <Link to="/documents">Back to documents</Link>
        </div>
      </div>
    );
  }

  const processing = doc.status === 'UPLOADED' || doc.status === 'PROCESSING';

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <p className="muted" style={{ marginBottom: 10 }}>
        <Link to="/documents">← Documents</Link>
      </p>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {doc.documentId}
          </h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {processing && <span className="spinner" />}
            <StatusBadge status={doc.status} />
          </span>
        </div>

        <div className="section-title">Document information</div>
        <dl className="kv">
          <dt>Filename</dt>
          <dd>{doc.filename}</dd>
          <dt>Document type</dt>
          <dd>{doc.documentType.replace(/_/g, ' ')}</dd>
          <dt>Uploaded</dt>
          <dd>{fmtDate(doc.createdAt)}</dd>
          <dt>Last updated</dt>
          <dd>{fmtDate(doc.updatedAt)}</dd>
          <dt>Attempts</dt>
          <dd>{doc.attempts}</dd>
        </dl>

        {doc.status === 'FAILED' && (
          <div className="alert error">
            <strong>Processing failed</strong>
            {doc.failureReason && <> — {friendlyReason(doc.failureReason)}</>}
            {doc.validationErrors && doc.validationErrors.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {doc.validationErrors.map((e) => (
                  <li key={e.field}>
                    <strong>{e.field}</strong>: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {doc.result && (
          <>
            <div className="section-title">Extracted information</div>
            <dl className="kv">
              <dt>Company name</dt>
              <dd>{doc.result.companyName || '—'}</dd>
              <dt>Registration number</dt>
              <dd>{doc.result.registrationNumber || '—'}</dd>
              <dt>Address</dt>
              <dd>{doc.result.address || '—'}</dd>
              <dt>Annual revenue</dt>
              <dd>{fmtCurrency(doc.result.annualRevenue)}</dd>
              <dt>Document date</dt>
              <dd>{doc.result.documentDate || '—'}</dd>
            </dl>
          </>
        )}

        <div className="section-title">Processing history</div>
        <ul className="timeline">
          {history.map((h, i) => (
            <li key={i}>
              <span className={`dot ${h.status}`}>{iconFor(h.status)}</span>
              <div>
                <div>
                  <strong>{label(h.status)}</strong>
                  {h.reason && <> — {friendlyReason(h.reason)}</>}
                  {h.attempt > 0 && <span className="muted"> (attempt {h.attempt})</span>}
                </div>
                <div className="meta">{fmtDate(h.timestamp)}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function iconFor(status: string): string {
  if (status === 'PROCESSED') return '✓';
  if (status === 'FAILED') return '✕';
  if (status === 'PROCESSING') return '⟳';
  return '↑';
}

function label(status: string): string {
  switch (status) {
    case 'UPLOADED':
      return 'Uploaded';
    case 'PROCESSING':
      return 'Processing';
    case 'PROCESSED':
      return 'Processed';
    case 'FAILED':
      return 'Failed';
    default:
      return status;
  }
}

// Map internal reason codes to user-friendly text (never expose raw codes).
function friendlyReason(reason: string): string {
  switch (reason) {
    case 'PROCESSOR_TIMEOUT':
      return 'Processor timed out';
    case 'PROCESSOR_ERROR':
      return 'Processor error';
    case 'INVALID_RESULT':
      return 'Extracted data was invalid';
    case 'VALIDATION_FAILED':
      return 'Validation failed';
    default:
      return reason.replace(/_/g, ' ').toLowerCase();
  }
}
