import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { albums, type NewAlbum } from '../schema';

export const albumsRepo = {
  listQuery(ownerId: string) {
    return db.select().from(albums).where(eq(albums.ownerId, ownerId)).orderBy(asc(albums.name));
  },

  create(ownerId: string, data: Pick<NewAlbum, 'name'>) {
    return db.insert(albums).values({ ...data, ownerId }).returning().get();
  },

  rename(id: number, ownerId: string, name: string) {
    return db.update(albums).set({ name }).where(and(eq(albums.id, id), eq(albums.ownerId, ownerId))).returning().get();
  },

  remove(id: number, ownerId: string) {
    return db.delete(albums).where(and(eq(albums.id, id), eq(albums.ownerId, ownerId))).returning().get();
  },

};
