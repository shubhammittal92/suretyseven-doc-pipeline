// Centralised configuration. Everything tunable lives here and is read from env
// with safe defaults so the app runs with zero config for local dev (SQLite).

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),

  // DB_CLIENT = 'pg' (Postgres, used by docker compose) or 'sqlite3' (local dev/tests).
  dbClient: (process.env.DB_CLIENT || 'sqlite3') as 'pg' | 'sqlite3',

  pg: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'docpipeline',
  },

  sqliteFile: process.env.SQLITE_FILE || './data/docpipeline.sqlite',

  // Processing / retry knobs.
  maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '3', 10),
  workerPollMs: parseInt(process.env.WORKER_POLL_MS || '500', 10),
  // Simulated processing latency window (ms) for the mock processor.
  processMinMs: parseInt(process.env.PROCESS_MIN_MS || '300', 10),
  processMaxMs: parseInt(process.env.PROCESS_MAX_MS || '1200', 10),
  // Probability weights for the mock processor outcome (only used when the file
  // does not deterministically encode an outcome via its name).
  failureRate: parseFloat(process.env.FAILURE_RATE || '0.35'),

  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || '10485760', 10), // 10 MB
};
