// Domain types and enums for the Document Processing Service.

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

// Result the mock processor can return. Drives retry decisions.
export enum ProcessorOutcome {
  SUCCESS = 'SUCCESS',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
  INVALID_RESULT = 'INVALID_RESULT',
}

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

export interface DocumentRecord {
  id: string;
  filename: string;
  document_type: string;
  status: DocumentStatus;
  content_hash: string;
  file_size: number;
  metadata: string | null; // JSON string
  result: string | null; // JSON string of ExtractedData
  validation_errors: string | null; // JSON string of ValidationError[]
  failure_reason: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: number;
  document_id: string;
  status: DocumentStatus;
  attempt: number;
  reason: string | null;
  created_at: string;
}
