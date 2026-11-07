import { and, desc, eq, isNotNull, isNull, like, lt, or, type SQL } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { db } from '../client';
import { albums, photoDeletions, photos, type NewPhoto } from '../schema';

export type PhotoFilters = {
  search: string;
  albumId: number | null;
  favoritesOnly: boolean;
};

export const photosRepo = {
  listQuery(ownerId: string, filters: PhotoFilters) {
    const conditions: SQL[] = [eq(photos.ownerId, ownerId)];
    const search = filters.search.trim();

    if (search) {
      conditions.push(like(photos.note, `%${search}%`));
    }
    if (filters.albumId !== null) {
      conditions.push(eq(photos.albumId, filters.albumId));
    }
    if (filters.favoritesOnly) {
      conditions.push(eq(photos.favorite, true));
    }

    return db
      .select({
        id: photos.id,
        uri: photos.uri,
        latitude: photos.latitude,
        longitude: photos.longitude,
        accuracy: photos.accuracy,
        source: photos.source,
        albumId: photos.albumId,
        albumName: albums.name,
        note: photos.note,
        favorite: photos.favorite,
        clientId: photos.clientId,
        updatedAt: photos.updatedAt,
        remotePath: photos.remotePath,
        syncedAt: photos.syncedAt,
        ownerId: photos.ownerId,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(photos.createdAt));
  },

  withLocationQuery(ownerId: string) {
    return db
      .select({
        id: photos.id,
        uri: photos.uri,
        latitude: photos.latitude,
        longitude: photos.longitude,
        accuracy: photos.accuracy,
        source: photos.source,
        albumId: photos.albumId,
        albumName: albums.name,
        note: photos.note,
        favorite: photos.favorite,
        clientId: photos.clientId,
        updatedAt: photos.updatedAt,
        remotePath: photos.remotePath,
        syncedAt: photos.syncedAt,
        ownerId: photos.ownerId,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
      .where(and(
        eq(photos.ownerId, ownerId),
        isNotNull(photos.latitude),
        isNotNull(photos.longitude),
      ))
      .orderBy(desc(photos.createdAt));
  },

  listForOwner(ownerId: string) {
    return db.select().from(photos).where(eq(photos.ownerId, ownerId)).orderBy(desc(photos.createdAt)).all();
  },

  listPending(ownerId: string) {
    return db
      .select()
      .from(photos)
      .where(and(
        eq(photos.ownerId, ownerId),
        or(isNull(photos.syncedAt), lt(photos.syncedAt, photos.updatedAt)),
      ))
      .orderBy(photos.createdAt)
      .all();
  },

  findById(id: number, ownerId: string) {
    return db
      .select({
        id: photos.id,
        uri: photos.uri,
        latitude: photos.latitude,
        longitude: photos.longitude,
        accuracy: photos.accuracy,
        source: photos.source,
        albumId: photos.albumId,
        albumName: albums.name,
        note: photos.note,
        favorite: photos.favorite,
        clientId: photos.clientId,
        updatedAt: photos.updatedAt,
        remotePath: photos.remotePath,
        syncedAt: photos.syncedAt,
        ownerId: photos.ownerId,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
        .where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)))
      .get();
  },

  create(data: Omit<NewPhoto, 'id' | 'createdAt'>) {
    return db.insert(photos).values(data).returning().get();
  },

  update(id: number, ownerId: string, data: Partial<Pick<NewPhoto, 'albumId' | 'note' | 'favorite'>>) {
    return db.update(photos)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)))
      .returning()
      .get();
  },

  removeWithTombstone(id: number, ownerId: string) {
    return db.transaction((tx) => {
      const photo = tx.select().from(photos)
        .where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)))
        .get();
      if (!photo) return undefined;

      if (photo.clientId) {
        tx.insert(photoDeletions).values({
          clientId: photo.clientId,
          ownerId,
          remotePath: photo.remotePath ?? `${ownerId}/${photo.clientId}.jpg`,
          deletedAt: new Date(),
        }).onConflictDoUpdate({
          target: photoDeletions.clientId,
          set: {
            ownerId,
            remotePath: photo.remotePath ?? `${ownerId}/${photo.clientId}.jpg`,
            deletedAt: new Date(),
          },
        }).run();
      }

      tx.delete(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId))).run();
      return photo;
    });
  },

  clearAll(ownerId: string) {
    return db.transaction((tx) => {
      const stored = tx.select().from(photos).where(eq(photos.ownerId, ownerId)).all();
      for (const photo of stored) {
        if (!photo.clientId) continue;
        tx.insert(photoDeletions).values({
          clientId: photo.clientId,
          ownerId,
          remotePath: photo.remotePath ?? `${ownerId}/${photo.clientId}.jpg`,
          deletedAt: new Date(),
        }).onConflictDoUpdate({
          target: photoDeletions.clientId,
          set: {
            ownerId,
            remotePath: photo.remotePath ?? `${ownerId}/${photo.clientId}.jpg`,
            deletedAt: new Date(),
          },
        }).run();
      }
      tx.delete(photos).where(eq(photos.ownerId, ownerId)).run();
      return stored;
    });
  },

  removeFromRemote(id: number, ownerId: string) {
    return db.delete(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId))).returning().get();
  },

  listDeletions(ownerId: string) {
    return db.select().from(photoDeletions)
      .where(eq(photoDeletions.ownerId, ownerId))
      .orderBy(photoDeletions.deletedAt)
      .all();
  },

  findDeletion(clientId: string, ownerId: string) {
    return db.select().from(photoDeletions)
      .where(and(eq(photoDeletions.clientId, clientId), eq(photoDeletions.ownerId, ownerId)))
      .get();
  },

  removeDeletion(clientId: string, ownerId: string) {
    return db.delete(photoDeletions)
      .where(and(eq(photoDeletions.clientId, clientId), eq(photoDeletions.ownerId, ownerId)))
      .run();
  },

  findByClientId(clientId: string, ownerId: string) {
    return db.select().from(photos)
      .where(and(eq(photos.clientId, clientId), eq(photos.ownerId, ownerId)))
      .get();
  },

  insertFromRemote(data: NewPhoto) {
    return db.insert(photos).values(data).returning().get();
  },

  applyRemote(
    id: number,
    changes: Pick<NewPhoto, 'latitude' | 'longitude' | 'note' | 'favorite' | 'source' | 'updatedAt' | 'remotePath' | 'syncedAt'>,
  ) {
    return db.update(photos).set(changes).where(eq(photos.id, id)).returning().get();
  },

  async ensureSyncFields(): Promise<void> {
    const rows = await db.select().from(photos).where(or(isNull(photos.clientId), isNull(photos.updatedAt))).all();
    for (const photo of rows) {
      await db.update(photos).set({
        clientId: photo.clientId ?? Crypto.randomUUID(),
        updatedAt: photo.updatedAt ?? photo.createdAt,
      }).where(eq(photos.id, photo.id));
    }
  },

  async ensureOwner(ownerId: string) {
    const existingOwners = await db.selectDistinct({ ownerId: photos.ownerId }).from(photos).where(isNotNull(photos.ownerId)).all();
    const otherOwnerExists = existingOwners.some((row) => row.ownerId !== ownerId);
    if (!otherOwnerExists) await db.update(photos).set({ ownerId }).where(isNull(photos.ownerId));
    await db.update(albums).set({ ownerId: 'legacy-unassigned' }).where(isNull(albums.ownerId));
  },

  markSynced(id: number, ownerId: string, remotePath: string, syncedAt: Date) {
    return db.update(photos)
      .set({ remotePath, syncedAt })
      .where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)))
      .returning()
      .get();
  },

  async ensureLocalOwner(ownerId: string) {
    const unownedPhotos = await db.select({ id: photos.id, albumId: photos.albumId }).from(photos)
      .where(isNull(photos.ownerId)).all();
    for (const photo of unownedPhotos) {
      if (photo.albumId !== null) {
        const [album] = await db.select({ ownerId: albums.ownerId }).from(albums)
          .where(eq(albums.id, photo.albumId)).limit(1).all();
        if (album?.ownerId === 'legacy-unassigned') continue;
      }
      await db.update(photos).set({ ownerId }).where(eq(photos.id, photo.id));
    }
  },
};
