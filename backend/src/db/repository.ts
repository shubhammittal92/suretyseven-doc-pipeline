import { getDb } from './knex';
import {
  DocumentRecord,
  DocumentStatus,
  HistoryEntry,
  ExtractedData,
  ValidationError,
} from '../types';

// All database access is funnelled through this repository so the rest of the
// code never touches Knex directly. Makes the storage engine swappable and the
// services trivially unit-testable.

export interface CreateDocumentInput {
  id: string;
  filename: string;
  documentType: string;
  contentHash: string;
  fileSize: number;
  metadata?: Record<string, unknown> | null;
}

export interface ListFilter {
  status?: DocumentStatus;
  documentType?: string;
  search?: string;
  page: number;
  pageSize: number;
}

const nowIso = () => new Date().toISOString();

export async function findByContentHash(
  contentHash: string
): Promise<DocumentRecord | undefined> {
  return getDb()<DocumentRecord>('documents').where({ content_hash: contentHash }).first();
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
  const ts = nowIso();
  const row: DocumentRecord = {
    id: input.id,
    filename: input.filename,
    document_type: input.documentType,
    status: DocumentStatus.UPLOADED,
    content_hash: input.contentHash,
    file_size: input.fileSize,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    result: null,
    validation_errors: null,
    failure_reason: null,
    attempts: 0,
    created_at: ts,
    updated_at: ts,
  };
  await getDb()('documents').insert(row);
  await addHistory(input.id, DocumentStatus.UPLOADED, 0, null);
  return row;
}

export async function getById(id: string): Promise<DocumentRecord | undefined> {
  return getDb()<DocumentRecord>('documents').where({ id }).first();
}

export async function addHistory(
  documentId: string,
  status: DocumentStatus,
  attempt: number,
  reason: string | null
): Promise<void> {
  await getDb()('document_history').insert({
    document_id: documentId,
    status,
    attempt,
    reason,
    created_at: nowIso(),
  });
}

export async function getHistory(documentId: string): Promise<HistoryEntry[]> {
  return getDb()<HistoryEntry>('document_history')
    .where({ document_id: documentId })
    .orderBy('id', 'asc');
}

// Atomically claim the next queued document for a worker: flip an UPLOADED (or a
// retry-eligible PROCESSING re-queue) row to PROCESSING. Returns the claimed row
// or undefined if the queue is empty.
export async function claimNextForProcessing(): Promise<DocumentRecord | undefined> {
  const db = getDb();
  return db.transaction(async (trx) => {
    const candidate = await trx<DocumentRecord>('documents')
      .where({ status: DocumentStatus.UPLOADED })
      .orderBy('created_at', 'asc')
      .first();
    if (!candidate) return undefined;
    const updated = await trx('documents')
      .where({ id: candidate.id, status: DocumentStatus.UPLOADED })
      .update({ status: DocumentStatus.PROCESSING, updated_at: nowIso() });
    if (!updated) return undefined; // lost the race to another worker
    await trx('document_history').insert({
      document_id: candidate.id,
      status: DocumentStatus.PROCESSING,
      attempt: candidate.attempts + 1,
      reason: null,
      created_at: nowIso(),
    });
    return { ...candidate, status: DocumentStatus.PROCESSING };
  });
}

export async function markProcessed(
  id: string,
  result: ExtractedData,
  attempt: number
): Promise<void> {
  await getDb()('documents').where({ id }).update({
    status: DocumentStatus.PROCESSED,
    result: JSON.stringify(result),
    validation_errors: null,
    failure_reason: null,
    attempts: attempt,
    updated_at: nowIso(),
  });
  await addHistory(id, DocumentStatus.PROCESSED, attempt, null);
}

export async function markFailed(
  id: string,
  reason: string,
  attempt: number,
  validationErrors?: ValidationError[]
): Promise<void> {
  await getDb()('documents')
    .where({ id })
    .update({
      status: DocumentStatus.FAILED,
      failure_reason: reason,
      validation_errors: validationErrors ? JSON.stringify(validationErrors) : null,
      attempts: attempt,
      updated_at: nowIso(),
    });
  await addHistory(id, DocumentStatus.FAILED, attempt, reason);
}

// Re-queue a transient failure for another attempt: back to UPLOADED so the
// worker picks it up again, recording the FAILED reason in history first.
export async function requeueAfterFailure(
  id: string,
  reason: string,
  attempt: number
): Promise<void> {
  await addHistory(id, DocumentStatus.FAILED, attempt, reason);
  await getDb()('documents').where({ id }).update({
    status: DocumentStatus.UPLOADED,
    failure_reason: reason,
    attempts: attempt,
    updated_at: nowIso(),
  });
}

export async function listDocuments(
  filter: ListFilter
): Promise<{ items: DocumentRecord[]; total: number }> {
  const db = getDb();
  const base = db<DocumentRecord>('documents');
  const applyFilters = (q: any) => {
    if (filter.status) q.where('status', filter.status);
    if (filter.documentType) q.where('document_type', filter.documentType);
    if (filter.search) q.whereRaw('LOWER(filename) LIKE ?', [`%${filter.search.toLowerCase()}%`]);
    return q;
  };

  const countRow = await applyFilters(base.clone()).count({ c: '*' });
  const total = Number((countRow[0] as any).c);

  const items = await applyFilters(base.clone())
    .orderBy('created_at', 'desc')
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize);

  return { items, total };
}

export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await getDb()('documents')
    .select('status')
    .count({ c: '*' })
    .groupBy('status');
  const out: Record<string, number> = {
    UPLOADED: 0,
    PROCESSING: 0,
    PROCESSED: 0,
    FAILED: 0,
    TOTAL: 0,
  };
  for (const r of rows as any[]) {
    out[r.status] = Number(r.c);
    out.TOTAL += Number(r.c);
  }
  return out;
}
