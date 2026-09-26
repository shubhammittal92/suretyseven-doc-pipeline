import crypto from 'crypto';
import * as repo from '../db/repository';
import { DocumentRecord, DocumentStatus, ExtractedData, ValidationError } from '../types';

// Duplicate detection strategy: SHA-256 content hash of the uploaded bytes.
// Chosen over filename+size (too weak: different files can collide, same file
// renamed would be missed) and over a client idempotency key (relies on the
// client behaving). A content hash is deterministic, tamper-evident, and needs
// no client cooperation. Trade-off: two genuinely-distinct uploads that happen
// to be byte-identical are treated as one, which is the correct behaviour here.
export function hashContent(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function genId(): string {
  // Short, human-readable, collision-resistant enough for this scope.
  return 'DOC-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

export interface UploadResult {
  document: DocumentRecord;
  duplicate: boolean;
}

export async function upload(params: {
  filename: string;
  documentType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown> | null;
}): Promise<UploadResult> {
  const contentHash = hashContent(params.buffer);

  const existing = await repo.findByContentHash(contentHash);
  if (existing) {
    // Idempotent upload: return the existing document rather than creating a copy.
    return { document: existing, duplicate: true };
  }

  const document = await repo.createDocument({
    id: genId(),
    filename: params.filename,
    documentType: params.documentType,
    contentHash,
    fileSize: params.buffer.length,
    metadata: params.metadata ?? null,
  });
  return { document, duplicate: false };
}

// Shape a DB row into the API response, parsing JSON columns.
export function toApi(doc: DocumentRecord) {
  const result: ExtractedData | null = doc.result ? JSON.parse(doc.result) : null;
  const validationErrors: ValidationError[] | null = doc.validation_errors
    ? JSON.parse(doc.validation_errors)
    : null;
  return {
    documentId: doc.id,
    filename: doc.filename,
    documentType: doc.document_type,
    status: doc.status as DocumentStatus,
    attempts: doc.attempts,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
    failureReason: doc.failure_reason,
    validationErrors,
    result,
  };
}
