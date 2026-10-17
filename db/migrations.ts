import { expoDb, initializeDatabase } from './client';
import { seedLegacyAlbums } from './seed';
import { photosRepo } from './repositories/photos';

type TableInfoRow = { name: string };
type TableName = 'photos' | 'albums';

function hasTable(tableName: TableName): boolean {
  const rows = expoDb.getAllSync<{ name: string }>(
    'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
    'table',
    tableName,
  );
  return rows.length > 0;
}

function hasColumn(tableName: TableName, columnName: string): boolean {
  if (!hasTable(tableName)) return false;
  const rows = expoDb.getAllSync<TableInfoRow>(`PRAGMA table_info("${tableName}")`);
  return rows.some((column) => column.name === columnName);
}

/** Applies missing schema pieces without relying on Drizzle's synchronous migrator. */
function migrateSchema(): void {
  expoDb.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      uri TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const photoColumns: Array<[string, string]> = [
    ['album_id', 'INTEGER REFERENCES albums(id)'],
    ['note', 'TEXT'],
    ['favorite', 'INTEGER NOT NULL DEFAULT 0'],
    ['client_id', 'TEXT'],
    ['updated_at', 'INTEGER'],
    ['remote_path', 'TEXT'],
    ['synced_at', 'INTEGER'],
    ['owner_id', 'TEXT'],
  ];
  for (const [column, declaration] of photoColumns) {
    if (!hasColumn('photos', column)) expoDb.execSync(`ALTER TABLE photos ADD COLUMN ${column} ${declaration};`);
  }
  if (!hasColumn('albums', 'owner_id')) expoDb.execSync('ALTER TABLE albums ADD COLUMN owner_id TEXT;');

  expoDb.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS albums_name_unique ON albums(name);
    CREATE UNIQUE INDEX IF NOT EXISTS photos_client_id_unique ON photos(client_id);
    CREATE TRIGGER IF NOT EXISTS albums_set_photo_album_null
    BEFORE DELETE ON albums
    BEGIN
      UPDATE photos SET album_id = NULL WHERE album_id = OLD.id;
    END;
  `);
}

let initializationPromise: Promise<void> | null = null;
let activeInitializationStage = 'abriendo SQLite';

function showStage(onStage: ((stage: string) => void) | undefined, stage: string): Promise<void> {
  activeInitializationStage = stage;
  onStage?.(stage);
  return new Promise((resolve) => setTimeout(resolve, 30));
}

export function initializeGeoCam(onStage?: (stage: string) => void): Promise<void> {
  if (initializationPromise) {
    onStage?.(activeInitializationStage);
    return initializationPromise;
  }

  const run = (async () => {
    let stage = 'abriendo SQLite';
    try {
      await showStage(onStage, stage);
      initializeDatabase();

      stage = 'actualizando tablas y columnas';
      await showStage(onStage, stage);
      migrateSchema();

      stage = 'preparando identificadores de sincronizacion';
      await showStage(onStage, stage);
      await photosRepo.ensureSyncFields();

      stage = 'preparando albumes locales';
      await showStage(onStage, stage);
      await seedLegacyAlbums();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      throw new Error(`Fallo durante ${stage}: ${message}`);
    }
  })();

  initializationPromise = run.catch((reason: unknown) => {
    initializationPromise = null;
    throw reason;
  });
  return initializationPromise;
}
