import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { getDb, closeDb } from './db/knex';
import { migrate } from './db/migrate';
import { startWorker, stopWorker } from './services/worker';

async function main() {
  // Ensure schema exists (idempotent) before serving traffic.
  await migrate(getDb());

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, dbClient: config.dbClient },
      'Document Processing Service listening'
    );
  });

  // Background async processing.
  startWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopWorker();
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
