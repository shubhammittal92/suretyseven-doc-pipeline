import { ExtractedData, ValidationError } from '../types';

// Validates extracted data against the assignment's rules:
//   companyName        -> required
//   registrationNumber -> required
//   annualRevenue      -> must be >= 0
//   documentDate       -> valid date
// Returns the list of violations (empty list == valid).
export function validateExtractedData(data: ExtractedData): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.companyName || String(data.companyName).trim() === '') {
    errors.push({ field: 'companyName', message: 'companyName is required' });
  }

  if (!data.registrationNumber || String(data.registrationNumber).trim() === '') {
    errors.push({ field: 'registrationNumber', message: 'registrationNumber is required' });
  }

  if (data.annualRevenue === undefined || data.annualRevenue === null) {
    errors.push({ field: 'annualRevenue', message: 'annualRevenue is required' });
  } else if (typeof data.annualRevenue !== 'number' || Number.isNaN(data.annualRevenue)) {
    errors.push({ field: 'annualRevenue', message: 'annualRevenue must be a number' });
  } else if (data.annualRevenue < 0) {
    errors.push({ field: 'annualRevenue', message: 'annualRevenue must be >= 0' });
  }

  if (data.documentDate !== undefined && data.documentDate !== null) {
    const t = Date.parse(String(data.documentDate));
    if (Number.isNaN(t)) {
      errors.push({ field: 'documentDate', message: 'documentDate must be a valid date' });
    }
  }

  return errors;
}
