// Typed API client. All requests go to /api/* (proxied to the backend). Errors
// are normalised to a friendly message so the UI never shows raw backend text.

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface ExtractedData {
  companyName?: string;
  registrationNumber?: string;
  address?: string;
  annualRevenue?: number;
  documentDate?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface DocumentDto {
  documentId: string;
  filename: string;
  documentType: string;
  status: DocumentStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
  validationErrors: ValidationError[] | null;
  result: ExtractedData | null;
}

export interface HistoryEntry {
  status: DocumentStatus;
  attempt: number;
  reason: string | null;
  timestamp: string;
}

export interface ListResponse {
  items: DocumentDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Stats {
  UPLOADED: number;
  PROCESSING: number;
  PROCESSED: number;
  FAILED: number;
  TOTAL: number;
}

const BASE = '/api';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocument(
  file: File,
  documentType: string,
  metadata?: string
): Promise<{ documentId: string; status: DocumentStatus; duplicate: boolean }> {
  const form = new FormData();
  form.append('file', file);
  form.append('documentType', documentType);
  if (metadata) form.append('metadata', metadata);
  const res = await fetch(`${BASE}/documents`, { method: 'POST', body: form });
  return handle(res);
}

export interface ListParams {
  status?: string;
  documentType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listDocuments(params: ListParams): Promise<ListResponse> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.documentType) q.set('documentType', params.documentType);
  if (params.search) q.set('search', params.search);
  q.set('page', String(params.page ?? 1));
  q.set('pageSize', String(params.pageSize ?? 10));
  const res = await fetch(`${BASE}/documents?${q.toString()}`);
  return handle(res);
}

export async function getDocument(id: string): Promise<DocumentDto> {
  return handle(await fetch(`${BASE}/documents/${id}`));
}

export async function getHistory(id: string): Promise<HistoryEntry[]> {
  return handle(await fetch(`${BASE}/documents/${id}/history`));
}

export async function getStats(): Promise<Stats> {
  return handle(await fetch(`${BASE}/documents/stats`));
}
