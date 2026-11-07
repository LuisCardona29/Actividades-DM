import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';

import { albumsRepo } from '@/db/repositories/albums';
import { photosRepo, type PhotoFilters } from '@/db/repositories/photos';
import { deletePhotoFile, persistPhotoFile } from '@/services/photoFiles';
import { syncAll, type SyncResult } from '@/services/sync';
import type { GeoCoords } from '@/types/geo';

export function usePhotos(ownerId: string | null, filters: PhotoFilters = { search: '', albumId: null, favoritesOnly: false }) {
  const scopedOwnerId = ownerId ?? '';
  const photosQuery = useLiveQuery(photosRepo.listQuery(scopedOwnerId, filters), [scopedOwnerId, filters.search, filters.albumId, filters.favoritesOnly]);
  const locationQuery = useLiveQuery(photosRepo.withLocationQuery(scopedOwnerId), [scopedOwnerId]);
  const albumsQuery = useLiveQuery(albumsRepo.listQuery(scopedOwnerId), [scopedOwnerId]);
  const [syncProgress, setSyncProgress] = useState<{ completed: number; total: number } | null>(null);

  const addPhoto = useCallback(async (input: {
    uri: string;
    source: 'camera' | 'gallery';
    coords: GeoCoords | null;
    albumId: number | null;
  }): Promise<void> => {
    if (!ownerId) throw new Error('Inicia sesion antes de guardar fotos.');
    const permanentUri = await persistPhotoFile(input.uri);

    try {
      await photosRepo.create({
        uri: permanentUri,
        ownerId,
        clientId: Crypto.randomUUID(),
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
  }, [ownerId]);

  const updatePhoto = useCallback(async (id: number, data: { albumId: number | null; note: string | null; favorite: boolean }) => {
    if (!ownerId) throw new Error('Inicia sesion antes de editar fotos.');
    return photosRepo.update(id, ownerId, data);
  }, [ownerId]);

  const removePhoto = useCallback(async (id: number): Promise<void> => {
    if (!ownerId) throw new Error('Inicia sesion antes de borrar fotos.');
    const photo = await photosRepo.removeWithTombstone(id, ownerId);
    if (!photo) return;
    deletePhotoFile(photo.uri);
  }, [ownerId]);

  const clearAll = useCallback(async (): Promise<void> => {
    if (!ownerId) return;
    const storedPhotos = await photosRepo.clearAll(ownerId);
    for (const photo of storedPhotos) {
      deletePhotoFile(photo.uri);
    }
  }, [ownerId]);

  const syncPhoto = useCallback(async (id: number): Promise<void> => {
    if (!ownerId) throw new Error('Inicia sesion antes de sincronizar fotos.');
    const photo = await photosRepo.findById(id, ownerId);
    if (!photo) throw new Error('La foto ya no existe en este dispositivo.');
    const result = await syncAll(ownerId);
    if (result.failed > 0) throw new Error(result.failures[0] ?? 'No se pudieron sincronizar todos los cambios.');
  }, [ownerId]);

  const syncPending = useCallback(async (): Promise<SyncResult> => {
    if (!ownerId) throw new Error('Inicia sesion antes de sincronizar fotos.');
    setSyncProgress({ completed: 0, total: 0 });
    try {
      return await syncAll(ownerId, setSyncProgress);
    } finally {
      setSyncProgress(null);
    }
  }, [ownerId]);

  return {
    photos: photosQuery.data,
    photosWithLocation: locationQuery.data,
    albums: albumsQuery.data,
    error: photosQuery.error ?? locationQuery.error ?? albumsQuery.error,
    addPhoto,
    updatePhoto,
    removePhoto,
    clearAll,
    syncPhoto,
    syncPending,
    syncProgress,
    createAlbum: (data: { name: string }) => {
      if (!ownerId) throw new Error('Inicia sesion antes de crear albumes.');
      return albumsRepo.create(ownerId, data);
    },
    renameAlbum: (id: number, name: string) => {
      if (!ownerId) throw new Error('Inicia sesion antes de editar albumes.');
      return albumsRepo.rename(id, ownerId, name);
    },
    removeAlbum: (id: number) => {
      if (!ownerId) throw new Error('Inicia sesion antes de eliminar albumes.');
      return albumsRepo.remove(id, ownerId);
    },
  };
}
