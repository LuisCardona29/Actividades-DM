import { db } from './client';
import { eq } from 'drizzle-orm';
import { albums } from './schema';

export async function seedAlbums(ownerId: string): Promise<void> {
  const seeded = await db.select({ id: albums.id }).from(albums).where(eq(albums.ownerId, ownerId)).limit(1).all();
  if (seeded.length > 0) return;
  await db.insert(albums).values([{ name: 'Riohacha', ownerId }, { name: 'Personal', ownerId }]).onConflictDoNothing();
}

export async function seedLegacyAlbums(): Promise<void> {
  const seeded = await db.select({ id: albums.id }).from(albums).where(eq(albums.ownerId, 'legacy-unassigned')).limit(1).all();
  if (seeded.length > 0) return;
  await db.insert(albums).values([
    { name: 'Riohacha', ownerId: 'legacy-unassigned' },
    { name: 'Personal', ownerId: 'legacy-unassigned' },
  ]).onConflictDoNothing();
}
