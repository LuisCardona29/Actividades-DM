import * as Network from 'expo-network';

import { photosRepo } from '@/db/repositories/photos';
import { syncMetaRepo } from '@/db/repositories/syncMeta';
import { deletePhotoFile, downloadPhotoFile } from '@/services/photoFiles';
import {
  applyCloudDeletion,
  listPhotoChanges,
  PHOTO_CHANGES_PAGE_SIZE,
  removeCloudPhotoFile,
  uploadPhoto,
  type RemotePhotoChange,
} from '@/services/cloudPhotos';
import { isPending, resolvePhotoConflict } from '@/services/syncLogic';

export { isPending, resolvePhotoConflict } from '@/services/syncLogic';

export type SyncProgress = { completed: number; total: number };
export type SyncResult = {
  pulled: number;
  pushed: number;
  deleted: number;
  failed: number;
  failures: string[];
  finishedAt: number;
};

function remoteUpdatedAt(photo: RemotePhotoChange): Date {
  const updatedAt = new Date(photo.updated_at);
  if (Number.isNaN(updatedAt.getTime())) throw new Error(`Fecha remota invalida para ${photo.client_id}.`);
  return updatedAt;
}

async function applyRemotePhoto(userId: string, remote: RemotePhotoChange): Promise<boolean> {
  const local = await photosRepo.findByClientId(remote.client_id, userId);
  const deletion = await photosRepo.findDeletion(remote.client_id, userId);
  const decision = resolvePhotoConflict({
    localUpdatedAt: local?.updatedAt ?? null,
    localDeletedAt: deletion?.deletedAt ?? null,
    remoteUpdatedAt: remote.updated_at,
    remoteDeletedAt: remote.deleted_at,
  });

  if (decision === 'keep-local') return false;

  if (decision === 'acknowledge-local-delete' || decision === 'apply-remote-delete') {
    if (local) {
      deletePhotoFile(local.uri);
      await photosRepo.removeFromRemote(local.id, userId);
    }
    if (deletion) await photosRepo.removeDeletion(remote.client_id, userId);
    await removeCloudPhotoFile(remote.storage_path);
    return true;
  }

  if (deletion) await photosRepo.removeDeletion(remote.client_id, userId);
  const updatedAt = remoteUpdatedAt(remote);
  if (local) {
    await photosRepo.applyRemote(local.id, {
      latitude: remote.latitude,
      longitude: remote.longitude,
      note: remote.note,
      favorite: remote.favorite,
      source: remote.source,
      updatedAt,
      remotePath: remote.storage_path,
      syncedAt: updatedAt,
    });
    return true;
  }

  const uri = await downloadPhotoFile(remote.storage_path, remote.client_id);
  try {
    await photosRepo.insertFromRemote({
      uri,
      ownerId: userId,
      clientId: remote.client_id,
      latitude: remote.latitude,
      longitude: remote.longitude,
      accuracy: null,
      source: remote.source,
      albumId: null,
      note: remote.note,
      favorite: remote.favorite,
      updatedAt,
      remotePath: remote.storage_path,
      syncedAt: updatedAt,
      createdAt: new Date(remote.taken_at),
    });
  } catch (error) {
    deletePhotoFile(uri);
    throw error;
  }
  return true;
}

async function pullChanges(userId: string, onProgress?: (progress: SyncProgress) => void): Promise<number> {
  const cursorKey = `serverVersion:${userId}`;
  let cursor = Number(await syncMetaRepo.get(cursorKey) ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('El cursor de sincronizacion guardado no es valido.');

  let pulled = 0;
  let completed = 0;
  while (true) {
    const changes = await listPhotoChanges(userId, cursor);
    if (changes.length === 0) break;
    for (const remote of changes) {
      if (!Number.isSafeInteger(remote.server_version) || remote.server_version <= cursor) {
        throw new Error(`Version remota invalida para ${remote.client_id}.`);
      }

      if (await applyRemotePhoto(userId, remote)) pulled += 1;
      cursor = remote.server_version;
      await syncMetaRepo.set(cursorKey, String(cursor));
      completed += 1;
      onProgress?.({ completed, total: Math.max(completed, changes.length) });
    }
    if (changes.length < PHOTO_CHANGES_PAGE_SIZE) break;
  }
  return pulled;
}

async function pushChanges(
  userId: string,
  result: SyncResult,
  onProgress?: (progress: SyncProgress) => void,
): Promise<boolean> {
  const deletions = await photosRepo.listDeletions(userId);
  const pending = await photosRepo.listPending(userId);
  const total = deletions.length + pending.length;
  let completed = 0;
  let conflict = false;

  for (const deletion of deletions) {
    try {
      const applied = await applyCloudDeletion(deletion);
      if (applied.applied) {
        await removeCloudPhotoFile(applied.storagePath);
        await photosRepo.removeDeletion(deletion.clientId, userId);
        result.deleted += 1;
      } else {
        conflict = true;
      }
    } catch (error) {
      result.failed += 1;
      result.failures.push(`${deletion.clientId}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      completed += 1;
      onProgress?.({ completed, total });
    }
  }

  for (const photo of pending) {
    try {
      if (await uploadPhoto(photo, userId)) result.pushed += 1;
      else conflict = true;
    } catch (error) {
      result.failed += 1;
      result.failures.push(`${photo.clientId ?? photo.id}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      completed += 1;
      onProgress?.({ completed, total });
    }
  }
  return conflict;
}

async function runSync(userId: string, onProgress?: (progress: SyncProgress) => void): Promise<SyncResult> {
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected !== true || network.isInternetReachable === false) {
    throw new Error('Sin conexion. Los cambios locales permanecen pendientes para el siguiente intento.');
  }

  const result: SyncResult = {
    pulled: 0,
    pushed: 0,
    deleted: 0,
    failed: 0,
    failures: [],
    finishedAt: Date.now(),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result.pulled += await pullChanges(userId, onProgress);
    const conflict = await pushChanges(userId, result, onProgress);
    if (!conflict) break;
    if (attempt === 2) {
      result.failed += 1;
      result.failures.push('Un cambio mas reciente llego durante la sincronizacion; vuelve a intentarlo.');
    }
  }
  result.finishedAt = Date.now();
  return result;
}

const activeSyncs = new Map<string, Promise<SyncResult>>();

export function syncAll(
  userId: string,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  const active = activeSyncs.get(userId);
  if (active) return active;

  const running = runSync(userId, onProgress).finally(() => {
    activeSyncs.delete(userId);
  });
  activeSyncs.set(userId, running);
  return running;
}
