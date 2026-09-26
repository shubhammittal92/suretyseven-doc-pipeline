// Force SQLite with a temp file per test run, low latency, and no random
// failures so tests are deterministic (outcomes are driven explicitly).
process.env.DB_CLIENT = 'sqlite3';
process.env.SQLITE_FILE = `./data/test-${process.pid}.sqlite`;
process.env.PROCESS_MIN_MS = '1';
process.env.PROCESS_MAX_MS = '5';
process.env.FAILURE_RATE = '0'; // no ambient randomness; tests script outcomes
process.env.WORKER_POLL_MS = '50';
process.env.LOG_LEVEL = 'silent';
process.env.MAX_ATTEMPTS = '3';
