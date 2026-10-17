import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

type GeoCamDatabase = ReturnType<typeof drizzle<typeof schema>>;

// Keep native database startup out of module evaluation. If SQLite fails to
// open or configure, the root layout can catch the error and render it instead
// of crashing before React mounts.
export let expoDb = null as unknown as ReturnType<typeof openDatabaseSync>;
export let db = null as unknown as GeoCamDatabase;

let initialized = false;

export function initializeDatabase(): void {
  if (initialized) return;

  const database = openDatabaseSync('geocam.db', { enableChangeListener: true });
  database.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  expoDb = database;
  db = drizzle(database, { schema });
  initialized = true;
}
