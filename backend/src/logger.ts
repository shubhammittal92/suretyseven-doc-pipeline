import pino from 'pino';

// Structured JSON logger. In dev we pretty-print if the transport is available,
// otherwise fall back to plain JSON so it never crashes on a missing dep.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Never log document contents; only identifiers and status live in log lines.
  redact: {
    paths: ['req.headers.authorization', 'file', 'result'],
    remove: true,
  },
});
