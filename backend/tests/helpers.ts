import { drainOnce } from '../src/services/worker';
import * as repo from '../src/db/repository';
import { DocumentStatus } from '../src/types';

// Minimal valid-enough PDF bytes (header is what multer/our mime check sees;
// content is irrelevant because processing is mocked).
export function pdfBuffer(marker = 'x'): Buffer {
  return Buffer.from(`%PDF-1.4\n%mock ${marker}\n%%EOF`);
}

// Run the worker queue to completion repeatedly until the document reaches a
// terminal state (PROCESSED/FAILED) or we exhaust attempts. Because retries
// re-queue as UPLOADED, we drain in a loop.
export async function runToTerminal(
  documentId: string,
  maxLoops = 10
): Promise<DocumentStatus> {
  for (let i = 0; i < maxLoops; i++) {
    await drainOnce();
    const doc = await repo.getById(documentId);
    if (!doc) throw new Error('document vanished');
    if (doc.status === DocumentStatus.PROCESSED || doc.status === DocumentStatus.FAILED) {
      return doc.status;
    }
  }
  const doc = await repo.getById(documentId);
  return doc!.status;
}
