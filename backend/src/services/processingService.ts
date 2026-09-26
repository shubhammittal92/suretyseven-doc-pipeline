import { config } from '../config';
import { logger } from '../logger';
import { ProcessorOutcome, DocumentRecord } from '../types';
import * as repo from '../db/repository';
import { processDocument } from './processor';
import { validateExtractedData } from './validator';

// Retry policy: TIMEOUT and ERROR are transient -> retry up to config.maxAttempts.
// INVALID_RESULT is a data problem, not a transient fault -> do NOT retry; the
// document is marked FAILED with validation errors so it is never silently
// treated as successfully processed.
const RETRYABLE = new Set<ProcessorOutcome>([
  ProcessorOutcome.TIMEOUT,
  ProcessorOutcome.ERROR,
]);

// Process one already-claimed (status=PROCESSING) document through one attempt,
// applying the retry / terminal decision. Returns the resulting status string.
export async function processOne(doc: DocumentRecord): Promise<string> {
  const attempt = doc.attempts + 1;
  const log = logger.child({ documentId: doc.id, attempt });

  const { outcome, data } = await processDocument(doc.id, doc.filename);
  log.info({ outcome, status: 'PROCESSING' }, 'processor returned');

  if (outcome === ProcessorOutcome.SUCCESS && data) {
    const errors = validateExtractedData(data);
    if (errors.length > 0) {
      // Extraction succeeded but data is invalid -> terminal FAILED, no retry.
      log.warn({ status: 'FAILED', reason: 'VALIDATION_FAILED', errors }, 'validation failed');
      await repo.markFailed(doc.id, 'VALIDATION_FAILED', attempt, errors);
      return 'FAILED';
    }
    await repo.markProcessed(doc.id, data, attempt);
    log.info({ status: 'PROCESSED' }, 'document processed');
    return 'PROCESSED';
  }

  if (outcome === ProcessorOutcome.INVALID_RESULT && data) {
    const errors = validateExtractedData(data);
    log.warn({ status: 'FAILED', reason: 'INVALID_RESULT', errors }, 'invalid extraction');
    await repo.markFailed(doc.id, 'INVALID_RESULT', attempt, errors);
    return 'FAILED';
  }

  // TIMEOUT or ERROR: transient. Retry if attempts remain, else terminal FAILED.
  const reason = outcome === ProcessorOutcome.TIMEOUT ? 'PROCESSOR_TIMEOUT' : 'PROCESSOR_ERROR';
  if (RETRYABLE.has(outcome) && attempt < config.maxAttempts) {
    log.warn({ status: 'FAILED', reason, willRetry: true }, 'transient failure, re-queueing');
    await repo.requeueAfterFailure(doc.id, reason, attempt);
    return 'RETRY';
  }

  log.error({ status: 'FAILED', reason, willRetry: false }, 'exhausted retries');
  await repo.markFailed(doc.id, reason, attempt);
  return 'FAILED';
}
