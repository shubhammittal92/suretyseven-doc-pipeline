import request from 'supertest';
import fs from 'fs';
import { createApp } from '../src/app';
import { getDb, closeDb } from '../src/db/knex';
import { migrate } from '../src/db/migrate';
import { config } from '../src/config';
import { ProcessorOutcome, DocumentStatus } from '../src/types';
import { scriptOutcomes } from '../src/services/processor';
import { pdfBuffer, runToTerminal } from './helpers';
import * as repo from '../src/db/repository';

const app = createApp();

beforeAll(async () => {
  await migrate(getDb());
});

afterAll(async () => {
  await closeDb();
  try {
    fs.rmSync(config.sqliteFile, { force: true });
    fs.rmSync(config.sqliteFile + '-wal', { force: true });
    fs.rmSync(config.sqliteFile + '-shm', { force: true });
  } catch {
    /* ignore */
  }
});

async function uploadDoc(filename: string, body: Buffer, documentType = 'FINANCIAL_STATEMENT') {
  return request(app)
    .post('/api/documents')
    .field('documentType', documentType)
    .attach('file', body, { filename, contentType: 'application/pdf' });
}

describe('Document upload', () => {
  it('accepts a valid PDF upload and returns UPLOADED', async () => {
    const res = await uploadDoc('report-success.pdf', pdfBuffer('upload-1'));
    expect(res.status).toBe(201);
    expect(res.body.documentId).toMatch(/^DOC-/);
    expect(res.body.status).toBe('UPLOADED');
    expect(res.body.duplicate).toBe(false);
  });

  it('rejects upload without a file', async () => {
    const res = await request(app)
      .post('/api/documents')
      .field('documentType', 'FINANCIAL_STATEMENT');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('rejects upload without a documentType', async () => {
    const res = await request(app)
      .post('/api/documents')
      .attach('file', pdfBuffer('nodoctype'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DOCUMENT_TYPE_REQUIRED');
  });

  it('rejects a non-PDF file', async () => {
    const res = await request(app)
      .post('/api/documents')
      .field('documentType', 'FINANCIAL_STATEMENT')
      .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('Successful processing', () => {
  it('processes a document to PROCESSED with extracted result', async () => {
    const res = await uploadDoc('report-success.pdf', pdfBuffer('ok-flow'));
    const id = res.body.documentId;
    const status = await runToTerminal(id);
    expect(status).toBe(DocumentStatus.PROCESSED);

    const detail = await request(app).get(`/api/documents/${id}`);
    expect(detail.body.status).toBe('PROCESSED');
    expect(detail.body.result.companyName).toBe('ABC Construction Pvt Ltd');
    expect(detail.body.result.annualRevenue).toBeGreaterThanOrEqual(0);
    expect(detail.body.validationErrors).toBeNull();
  });
});

describe('Invalid extracted data', () => {
  it('marks a document FAILED with validation errors when extraction is invalid', async () => {
    const res = await uploadDoc('report-invalid.pdf', pdfBuffer('bad-data'));
    const id = res.body.documentId;
    const status = await runToTerminal(id);
    expect(status).toBe(DocumentStatus.FAILED);

    const detail = await request(app).get(`/api/documents/${id}`);
    expect(detail.body.status).toBe('FAILED');
    expect(detail.body.failureReason).toBe('INVALID_RESULT');
    const fields = detail.body.validationErrors.map((e: any) => e.field);
    expect(fields).toContain('companyName');
    expect(fields).toContain('registrationNumber');
    expect(fields).toContain('annualRevenue');
  });
});

describe('Processor failure', () => {
  it('marks FAILED after exhausting retries on repeated TIMEOUT', async () => {
    const res = await uploadDoc('report.pdf', pdfBuffer('always-timeout'));
    const id = res.body.documentId;
    // Script 3 timeouts (== MAX_ATTEMPTS) -> should end FAILED.
    scriptOutcomes(id, [
      ProcessorOutcome.TIMEOUT,
      ProcessorOutcome.TIMEOUT,
      ProcessorOutcome.TIMEOUT,
    ]);
    const status = await runToTerminal(id);
    expect(status).toBe(DocumentStatus.FAILED);
    const detail = await request(app).get(`/api/documents/${id}`);
    expect(detail.body.failureReason).toBe('PROCESSOR_TIMEOUT');
    expect(detail.body.attempts).toBe(3);
  });
});

describe('Failure followed by a successful retry', () => {
  it('recovers to PROCESSED after a transient failure', async () => {
    const res = await uploadDoc('report.pdf', pdfBuffer('retry-then-ok'));
    const id = res.body.documentId;
    // First attempt fails transiently, second succeeds.
    scriptOutcomes(id, [ProcessorOutcome.ERROR, ProcessorOutcome.SUCCESS]);
    const status = await runToTerminal(id);
    expect(status).toBe(DocumentStatus.PROCESSED);

    const hist = await request(app).get(`/api/documents/${id}/history`);
    const statuses = hist.body.map((h: any) => h.status);
    // UPLOADED -> PROCESSING -> FAILED(retry) -> PROCESSING -> PROCESSED
    expect(statuses).toEqual([
      'UPLOADED',
      'PROCESSING',
      'FAILED',
      'PROCESSING',
      'PROCESSED',
    ]);
    const failed = hist.body.find((h: any) => h.status === 'FAILED');
    expect(failed.reason).toBe('PROCESSOR_ERROR');
  });
});

describe('Duplicate uploads', () => {
  it('returns the existing document (not a copy) on identical content', async () => {
    const buf = pdfBuffer('dup-content-unique');
    const first = await uploadDoc('first.pdf', buf);
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const second = await uploadDoc('second-renamed.pdf', buf);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.documentId).toBe(first.body.documentId);
  });
});

describe('Listing, filtering, stats', () => {
  it('filters by status and paginates', async () => {
    const res = await request(app).get('/api/documents?status=PROCESSED&page=1&pageSize=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const item of res.body.items) expect(item.status).toBe('PROCESSED');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalPages');
  });

  it('returns dashboard stats', async () => {
    const res = await request(app).get('/api/documents/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('TOTAL');
    expect(res.body).toHaveProperty('PROCESSED');
    expect(res.body).toHaveProperty('FAILED');
  });

  it('404s for an unknown document', async () => {
    const res = await request(app).get('/api/documents/DOC-DOESNOTEXIST');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
