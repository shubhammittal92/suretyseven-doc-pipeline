import { config } from '../config';
import { logger } from '../logger';
import * as repo from '../db/repository';
import { processOne } from './processingService';

// A lightweight in-process worker. It polls the documents table for the next
// UPLOADED row, atomically claims it (flip to PROCESSING inside a transaction),
// and processes it. Re-queued retries reappear as UPLOADED and are picked up on a
// later tick. This is deliberately simple per the assignment ("no distributed
// retry system needed"); the 1M-docs/day answer swaps this for SQS + workers.

let running = false;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return; // prevent overlapping ticks
  ticking = true;
  try {
    // Drain the queue this tick: keep claiming until empty.
    // Each claim is atomic so multiple worker instances stay safe.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const doc = await repo.claimNextForProcessing();
      if (!doc) break;
      // Fire-and-await sequentially to keep SQLite (single writer) happy.
      await processOne(doc).catch((err) =>
        logger.error({ err, documentId: doc.id }, 'processOne threw')
      );
    }
  } catch (err) {
    logger.error({ err }, 'worker tick failed');
  } finally {
    ticking = false;
  }
}

export function startWorker(): void {
  if (running) return;
  running = true;
  logger.info({ pollMs: config.workerPollMs }, 'worker started');
  timer = setInterval(tick, config.workerPollMs);
}

export function stopWorker(): void {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Exposed for tests: run the queue to completion synchronously (no polling).
export async function drainOnce(): Promise<void> {
  await tick();
}
