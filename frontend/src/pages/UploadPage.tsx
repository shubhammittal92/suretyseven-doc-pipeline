import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadDocument } from '../api/client';
import { useToast } from '../components/Toast';

const DOC_TYPES = [
  'FINANCIAL_STATEMENT',
  'INSURANCE_CERTIFICATE',
  'BROKER_SUBMISSION',
  'REGISTRATION_DOCUMENT',
  'OTHER',
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();
  const nav = useNavigate();

  const pick = (f: File | null) => {
    if (f && f.type !== 'application/pdf') {
      notify('error', 'Only PDF files are supported.');
      return;
    }
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      notify('error', 'Please select a PDF to upload.');
      return;
    }
    setBusy(true);
    try {
      const res = await uploadDocument(file, docType);
      if (res.duplicate) {
        notify('info', `Duplicate detected — showing existing ${res.documentId}.`);
      } else {
        notify('success', `Uploaded ${res.documentId}. Processing started.`);
      }
      nav(`/documents/${res.documentId}`);
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Upload a document</h1>
      <p className="page-sub">
        Upload a PDF for processing. The system extracts, validates and tracks it end to end.
      </p>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="doctype">Document type</label>
          <select
            id="doctype"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Document (PDF)</label>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            role="button"
            tabIndex={0}
            aria-label="Choose a PDF file"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
          >
            {file ? (
              <div>
                <strong>{file.name}</strong>
                <div className="muted">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className="muted">Click or drag a PDF here</div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Upload'}
        </button>
        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Tip: name a file with <code>success</code>, <code>timeout</code>,{' '}
          <code>error</code> or <code>invalid</code> to force the mock processor's outcome
          for demos.
        </p>
      </form>
    </div>
  );
}
