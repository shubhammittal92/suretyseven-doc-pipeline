import { Knex } from 'knex';
import { getDb, closeDb } from './knex';
import { logger } from '../logger';

// Idempotent schema creation. Kept as a plain function so it can be invoked both
// from the CLI (npm run migrate) and from the test setup / server bootstrap.
export async function migrate(db: Knex = getDb()): Promise<void> {
  const hasDocs = await db.schema.hasTable('documents');
  if (!hasDocs) {
    await db.schema.createTable('documents', (t) => {
      t.string('id').primary();
      t.string('filename').notNullable();
      t.string('document_type').notNullable();
      t.string('status').notNullable().index();
      t.string('content_hash').notNullable().index();
      t.integer('file_size').notNullable();
      t.text('metadata').nullable();
      t.text('result').nullable();
      t.text('validation_errors').nullable();
      t.string('failure_reason').nullable();
      t.integer('attempts').notNullable().defaultTo(0);
      t.timestamp('created_at').notNullable();
      t.timestamp('updated_at').notNullable();
    });
  }

  const hasHistory = await db.schema.hasTable('document_history');
  if (!hasHistory) {
    await db.schema.createTable('document_history', (t) => {
      t.increments('id').primary();
      t.string('document_id').notNullable().index();
      t.string('status').notNullable();
      t.integer('attempt').notNullable().defaultTo(0);
      t.string('reason').nullable();
      t.timestamp('created_at').notNullable();
    });
  }
}

// Allow `ts-node src/db/migrate.ts` as a standalone CLI entry point.
if (require.main === module) {
  migrate()
    .then(() => {
      logger.info('Migration complete');
      return closeDb();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
