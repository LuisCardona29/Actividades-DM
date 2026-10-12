import { asc, eq } from 'drizzle-orm';

import { db } from '../client';
import { albums, type NewAlbum } from '../schema';

export const albumsRepo = {
  listQuery() {
    return db.select().from(albums).orderBy(asc(albums.name));
  },

  create(data: Pick<NewAlbum, 'name'>) {
    return db.insert(albums).values(data).returning().get();
  },

  rename(id: number, name: string) {
    return db.update(albums).set({ name }).where(eq(albums.id, id)).returning().get();
  },

  remove(id: number) {
    return db.delete(albums).where(eq(albums.id, id)).returning().get();
  },
};