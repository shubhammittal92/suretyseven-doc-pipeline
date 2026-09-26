import { DocumentStatus } from '../api/client';

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function fmtCurrency(n?: number): string {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}
