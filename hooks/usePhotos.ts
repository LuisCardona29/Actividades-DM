import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback } from 'react';

import { albumsRepo } from '@/db/repositories/albums';
import { photosRepo, type PhotoFilters } from '@/db/repositories/photos';
import { deletePhotoFile, persistPhotoFile } from '@/services/photoFiles';
import type { GeoCoords } from '@/types/geo';

export function usePhotos(filters: PhotoFilters = { search: '', albumId: null, favoritesOnly: false }) {
  const photosQuery = useLiveQuery(photosRepo.listQuery(filters), [filters.search, filters.albumId, filters.favoritesOnly]);
  const locationQuery = useLiveQuery(photosRepo.withLocationQuery());
  const albumsQuery = useLiveQuery(albumsRepo.listQuery());

  const addPhoto = useCallback(async (input: {
    uri: string;
    source: 'camera' | 'gallery';
    coords: GeoCoords | null;
    albumId: number | null;
  }): Promise<void> => {
    const permanentUri = persistPhotoFile(input.uri);

    try {
      await photosRepo.create({
        uri: permanentUri,
        latitude: input.coords?.latitude ?? null,
        longitude: input.coords?.longitude ?? null,
        accuracy: input.coords?.accuracy ?? null,
        source: input.source,
        albumId: input.albumId,
        note: null,
        favorite: false,
      });
    } catch (error) {
      deletePhotoFile(permanentUri);
      throw error;
    }
  }, []);

  const updatePhoto = useCallback((id: number, data: { albumId: number | null; note: string | null; favorite: boolean }) => {
    return photosRepo.update(id, data);
  }, []);

  const removePhoto = useCallback(async (id: number): Promise<void> => {
    const photo = await photosRepo.findById(id);
    if (!photo) return;

    deletePhotoFile(photo.uri);
    await photosRepo.remove(id);
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    const storedPhotos = await photosRepo.clearAll();
    for (const photo of storedPhotos) {
      deletePhotoFile(photo.uri);
    }
  }, []);

  return {
    photos: photosQuery.data,
    photosWithLocation: locationQuery.data,
    albums: albumsQuery.data,
    error: photosQuery.error ?? locationQuery.error ?? albumsQuery.error,
    addPhoto,
    updatePhoto,
    removePhoto,
    clearAll,
    createAlbum: albumsRepo.create,
    renameAlbum: albumsRepo.rename,
    removeAlbum: albumsRepo.remove,
  };
}