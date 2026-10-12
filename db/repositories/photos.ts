import { and, desc, eq, isNotNull, like, type SQL } from 'drizzle-orm';

import { db } from '../client';
import { albums, photos, type NewPhoto } from '../schema';

export type PhotoFilters = {
  search: string;
  albumId: number | null;
  favoritesOnly: boolean;
};

export const photosRepo = {
  listQuery(filters: PhotoFilters) {
    const conditions: SQL[] = [];
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
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(photos.createdAt));
  },

  withLocationQuery() {
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
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
      .where(and(isNotNull(photos.latitude), isNotNull(photos.longitude)))
      .orderBy(desc(photos.createdAt));
  },

  findById(id: number) {
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
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(albums, eq(photos.albumId, albums.id))
      .where(eq(photos.id, id))
      .get();
  },

  create(data: Omit<NewPhoto, 'id' | 'createdAt'>) {
    return db.insert(photos).values(data).returning().get();
  },

  update(id: number, data: Partial<Pick<NewPhoto, 'albumId' | 'note' | 'favorite'>>) {
    return db.update(photos).set(data).where(eq(photos.id, id)).returning().get();
  },

  remove(id: number) {
    return db.delete(photos).where(eq(photos.id, id)).returning().get();
  },

  clearAll() {
    return db.delete(photos).returning().all();
  },
};