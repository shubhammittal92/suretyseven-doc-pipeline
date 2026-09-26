import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDocuments, getStats, DocumentDto, Stats } from '../api/client';
import { StatusBadge, fmtDate } from '../components/ui';
import { useToast } from '../components/Toast';

const STATUSES = ['', 'UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED'];
const PAGE_SIZE = 10;

export default function ListPage() {
  const [items, setItems] = useState<DocumentDto[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState('');
  const [docType, setDocType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();
  const nav = useNavigate();

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [list, s] = await Promise.all([
          listDocuments({
            status: status || undefined,
            documentType: docType || undefined,
            search: search || undefined,
            page,
            pageSize: PAGE_SIZE,
          }),
          getStats(),
        ]);
        setItems(list.items);
        setTotalPages(list.totalPages || 1);
        setTotal(list.total);
        setStats(s);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
        if (!silent) notify('error', (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [status, docType, search, page, notify]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh while anything is in flight so statuses update without a manual reload.
  useEffect(() => {
    const inFlight =
      items.some((d) => d.status === 'UPLOADED' || d.status === 'PROCESSING') ||
      (stats && (stats.UPLOADED > 0 || stats.PROCESSING > 0));
    if (!inFlight) return;
    const t = setInterval(() => load(true), 2000);
    return () => clearInterval(t);
  }, [items, stats, load]);

  return (
    <div className="container">
      <h1 className="page-title">Documents</h1>
      <p className="page-sub">All uploaded documents and their processing status.</p>

      <div className="grid-stats">
        <Stat label="Total" value={stats?.TOTAL} />
        <Stat label="Processing" value={(stats?.UPLOADED ?? 0) + (stats?.PROCESSING ?? 0)} />
        <Stat label="Processed" value={stats?.PROCESSED} />
        <Stat label="Failed" value={stats?.FAILED} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row">
          <div>
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || 'All statuses'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Document type</label>
            <input
              type="text"
              placeholder="e.g. FINANCIAL_STATEMENT"
              value={docType}
              onChange={(e) => {
                setPage(1);
                setDocType(e.target.value);
              }}
            />
          </div>
          <div>
            <label>Search filename</label>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="center-state">Could not load documents. Please retry.</div>
        ) : items.length === 0 ? (
          <div className="center-state">
            No documents match your filters.
            <br />
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => nav('/')}>
              Upload one
            </button>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Document ID</th>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.documentId} onClick={() => nav(`/documents/${d.documentId}`)}>
                    <td>
                      <strong>{d.documentId}</strong>
                    </td>
                    <td>{d.filename}</td>
                    <td>{d.documentType.replace(/_/g, ' ')}</td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="muted">{fmtDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <span className="muted">
                Page {page} of {totalPages} · {total} total
              </span>
              <button
                className="btn secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="btn secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="stat">
      <div className="num">{value ?? '—'}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ margin: '14px 0' }} />
      ))}
    </div>
  );
}
