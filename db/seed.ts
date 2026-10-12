import { db } from './client';
import { albums } from './schema';

export async function seedAlbums(): Promise<void> {
  await db.insert(albums).values([{ name: 'Riohacha' }, { name: 'Personal' }]).onConflictDoNothing();
}