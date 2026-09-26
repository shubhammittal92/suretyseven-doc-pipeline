import { ExtractedData, ProcessorOutcome } from '../types';
import { config } from '../config';

// The mock processor. Real OCR/AI is explicitly out of scope for the assignment,
// so we simulate: a short delay, then an outcome. Outcomes are made controllable
// for deterministic tests: encoding a keyword in the filename forces an outcome,
// and an optional per-document override lets a test drive the retry sequence.
//
//   filename contains "success"  -> always SUCCESS
//   filename contains "timeout"  -> always TIMEOUT
//   filename contains "error"    -> always ERROR
//   filename contains "invalid"  -> always INVALID_RESULT (extraction missing required fields)
// Otherwise a weighted random outcome using config.failureRate.

export interface ProcessResult {
  outcome: ProcessorOutcome;
  data?: ExtractedData;
}

// Per-document scripted outcomes, consumed one attempt at a time. Used by tests
// to model "fail once, then succeed" without touching global randomness.
const scripted = new Map<string, ProcessorOutcome[]>();

export function scriptOutcomes(documentId: string, outcomes: ProcessorOutcome[]): void {
  scripted.set(documentId, [...outcomes]);
}

export function clearScript(documentId: string): void {
  scripted.delete(documentId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function outcomeFromFilename(filename: string): ProcessorOutcome | null {
  const f = filename.toLowerCase();
  if (f.includes('success')) return ProcessorOutcome.SUCCESS;
  if (f.includes('timeout')) return ProcessorOutcome.TIMEOUT;
  if (f.includes('error')) return ProcessorOutcome.ERROR;
  if (f.includes('invalid')) return ProcessorOutcome.INVALID_RESULT;
  return null;
}

function randomOutcome(): ProcessorOutcome {
  if (Math.random() >= config.failureRate) return ProcessorOutcome.SUCCESS;
  const failures = [
    ProcessorOutcome.TIMEOUT,
    ProcessorOutcome.ERROR,
    ProcessorOutcome.INVALID_RESULT,
  ];
  return failures[Math.floor(Math.random() * failures.length)];
}

function goodExtraction(): ExtractedData {
  return {
    companyName: 'ABC Construction Pvt Ltd',
    registrationNumber: 'U12345DL2020PTC123456',
    address: 'New Delhi',
    annualRevenue: 12500000,
    documentDate: '2026-08-15',
  };
}

// INVALID_RESULT simulates extraction that "worked" but produced data that fails
// validation (missing required fields + negative revenue).
function invalidExtraction(): ExtractedData {
  return {
    companyName: '',
    registrationNumber: '',
    address: 'Nowhere',
    annualRevenue: -5,
    documentDate: 'not-a-date',
  };
}

export async function processDocument(
  documentId: string,
  filename: string
): Promise<ProcessResult> {
  const delay =
    config.processMinMs +
    Math.floor(Math.random() * Math.max(1, config.processMaxMs - config.processMinMs));
  await sleep(delay);

  let outcome: ProcessorOutcome;
  const script = scripted.get(documentId);
  if (script && script.length > 0) {
    outcome = script.shift()!;
  } else {
    outcome = outcomeFromFilename(filename) ?? randomOutcome();
  }

  switch (outcome) {
    case ProcessorOutcome.SUCCESS:
      return { outcome, data: goodExtraction() };
    case ProcessorOutcome.INVALID_RESULT:
      return { outcome, data: invalidExtraction() };
    case ProcessorOutcome.TIMEOUT:
    case ProcessorOutcome.ERROR:
    default:
      return { outcome };
  }
}
