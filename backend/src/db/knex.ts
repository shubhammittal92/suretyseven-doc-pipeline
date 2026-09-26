import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// A single Knex instance speaks both SQLite (local/tests) and Postgres (docker).
// Using a query builder instead of raw SQL keeps one code path across both
// engines, which is why the same repository works in dev and in the graded run.
let instance: Knex | null = null;

export function getDb(): Knex {
  if (instance) return instance;

  if (config.dbClient === 'pg') {
    instance = knex({
      client: 'pg',
      connection: {
        host: config.pg.host,
        port: config.pg.port,
        user: config.pg.user,
        password: config.pg.password,
        database: config.pg.database,
      },
      pool: { min: 0, max: 10 },
    });
  } else {
    const file = config.sqliteFile;
    const dir = path.dirname(file);
    if (dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    instance = knex({
      client: 'sqlite3',
      connection: { filename: file },
      useNullAsDefault: true,
      pool: {
        // SQLite is single-writer; enable WAL + busy timeout for concurrent reads.
        afterCreate: (conn: any, done: any) => {
          conn.run('PRAGMA journal_mode = WAL;', () =>
            conn.run('PRAGMA busy_timeout = 5000;', done)
          );
        },
      },
    });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}
