import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { useCallback, useState } from 'react';

import { albumsRepo } from '@/db/repositories/albums';
import { photosRepo, type PhotoFilters } from '@/db/repositories/photos';
import { deleteCloudPhoto, uploadPhoto } from '@/services/cloudPhotos';
import { deletePhotoFile, persistPhotoFile } from '@/services/photoFiles';
import type { GeoCoords } from '@/types/geo';

export type PhotoSyncResult = {
  total: number;
  synced: number;
  failed: number;
  failures: string[];
};

async function requireConnection(): Promise<void> {
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected !== true || network.isInternetReachable === false) {
    throw new Error('Sin conexion. No se modificaron las fotos locales ni las de la nube.');
  }
}

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
    const permanentUri = persistPhotoFile(input.uri);

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
    const updated = await photosRepo.update(id, ownerId, data);
    if (updated?.syncedAt) {
      await uploadPhoto(updated, ownerId);
    }
    return updated;
  }, [ownerId]);

  const removePhoto = useCallback(async (id: number): Promise<void> => {
    if (!ownerId) throw new Error('Inicia sesion antes de borrar fotos.');
    const photo = await photosRepo.findById(id, ownerId);
    if (!photo) return;

    if (photo.remotePath || photo.syncedAt) {
      await requireConnection();
      await deleteCloudPhoto(photo, ownerId);
    }

    deletePhotoFile(photo.uri);
    await photosRepo.remove(id, ownerId);
  }, [ownerId]);

  const clearAll = useCallback(async (): Promise<void> => {
    if (!ownerId) return;
    const storedPhotos = await photosRepo.listForOwner(ownerId);
    if (storedPhotos.some((photo) => photo.remotePath || photo.syncedAt)) await requireConnection();
    for (const photo of storedPhotos) {
      if (photo.remotePath || photo.syncedAt) await deleteCloudPhoto(photo, ownerId);
    }
    for (const photo of storedPhotos) {
      deletePhotoFile(photo.uri);
    }
    await photosRepo.clearAll(ownerId);
  }, [ownerId]);

  const syncPhoto = useCallback(async (id: number): Promise<void> => {
    if (!ownerId) throw new Error('Inicia sesion antes de sincronizar fotos.');
    await requireConnection();
    const photo = await photosRepo.findById(id, ownerId);
    if (!photo) throw new Error('La foto ya no existe en este dispositivo.');
    if (photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt) return;
    await uploadPhoto(photo, ownerId);
  }, [ownerId]);

  const syncPending = useCallback(async (): Promise<PhotoSyncResult> => {
    if (!ownerId) throw new Error('Inicia sesion antes de sincronizar fotos.');
    await requireConnection();

    const pending = await photosRepo.listPending(ownerId);
    const result: PhotoSyncResult = { total: pending.length, synced: 0, failed: 0, failures: [] };
    setSyncProgress({ completed: 0, total: result.total });
    try {
      for (const photo of pending) {
        try {
          await uploadPhoto(photo, ownerId);
          result.synced += 1;
        } catch (error) {
          result.failed += 1;
          result.failures.push(`${photo.clientId ?? photo.id}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        } finally {
          setSyncProgress({ completed: result.synced + result.failed, total: result.total });
        }
      }
      return result;
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
