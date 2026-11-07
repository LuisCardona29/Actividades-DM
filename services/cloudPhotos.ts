import { photosRepo } from '@/db/repositories/photos';
import type { Photo } from '@/db/schema';
import { supabase } from '@/lib/supabase';
import { splitIdPage } from '@/services/feedPaging';

export const BUCKET = 'geocam';
export const CLOUD_PHOTO_PAGE_SIZE = 20;
export const PHOTO_CHANGES_PAGE_SIZE = 200;

export type CloudPhoto = {
  id: number;
  client_id: string;
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  favorite: boolean;
  source: 'camera' | 'gallery';
  taken_at: string;
  updated_at: string;
};

export type CloudPhotoView = CloudPhoto & { signedUrl: string };
export type CloudPhotoCursor = { id: number };
export type CloudPhotoPage = { items: CloudPhotoView[]; nextCursor: CloudPhotoCursor | null };

export type RemotePhotoChange = {
  client_id: string;
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  favorite: boolean;
  source: 'camera' | 'gallery';
  taken_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: number;
};

type RemotePhotoLookup = {
  storage_path: string;
  updated_at: string;
  deleted_at: string | null;
};

function mimeTypeFor(uri: string): string {
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionFor(uri: string): string {
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'jpg';
}

async function readPhotoBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer el archivo local de la foto.');
  return response.arrayBuffer();
}

export async function uploadPhoto(photo: Photo, userId: string): Promise<boolean> {
  if (!photo.clientId) throw new Error('La foto no tiene clientId. Cierra y abre GeoCam para completar su migracion.');

  const updatedAt = photo.updatedAt ?? photo.createdAt;
  const updatedAtIso = updatedAt.toISOString();
  const { data: existing, error: lookupError } = await supabase
    .from('photos')
    .select('storage_path, updated_at, deleted_at')
    .eq('client_id', photo.clientId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const remote = existing as RemotePhotoLookup | null;
  const remoteTime = remote ? new Date(remote.updated_at).getTime() : 0;
  if (remote && (
    remoteTime > updatedAt.getTime()
    || (remote.deleted_at !== null && remoteTime >= updatedAt.getTime())
  )) return false;

  const storagePath = remote?.storage_path ?? photo.remotePath ?? `${userId}/${photo.clientId}.${extensionFor(photo.uri)}`;
  if (!remote || remote.deleted_at) {
    const arrayBuffer = await readPhotoBytes(photo.uri);
    if (arrayBuffer.byteLength === 0) throw new Error('El archivo local esta vacio; no se subio a la nube.');
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
      contentType: mimeTypeFor(photo.uri),
      upsert: Boolean(remote),
    });
    if (uploadError) throw uploadError;
  }

  const { error: rowError } = await supabase
    .from('photos')
    .upsert({
      user_id: userId,
      client_id: photo.clientId,
      storage_path: storagePath,
      latitude: photo.latitude,
      longitude: photo.longitude,
      note: photo.note,
      favorite: photo.favorite,
      source: photo.source,
      taken_at: photo.createdAt.toISOString(),
      updated_at: updatedAtIso,
      deleted_at: null,
    }, { onConflict: 'user_id,client_id' });

  if (rowError) {
    if (!remote) {
      const { error: rollbackError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (rollbackError) {
        throw new Error(`No se guardaron los metadatos y tampoco se pudo limpiar el archivo huerfano: ${rowError.message}; ${rollbackError.message}`);
      }
    }
    throw rowError;
  }

  const { data: saved, error: savedError } = await supabase
    .from('photos')
    .select('updated_at, deleted_at')
    .eq('client_id', photo.clientId)
    .eq('user_id', userId)
    .maybeSingle();
  if (savedError) throw savedError;
  if (!saved || saved.deleted_at || new Date(saved.updated_at).getTime() > updatedAt.getTime()) return false;

  const acknowledged = await photosRepo.markSynced(photo.id, userId, storagePath, updatedAt);
  return Boolean(acknowledged && (acknowledged.updatedAt?.getTime() ?? 0) <= updatedAt.getTime());
}

export async function listCloudPhotosPage(
  userId: string,
  cursor: CloudPhotoCursor | null,
): Promise<CloudPhotoPage> {
  let query = supabase
    .from('photos')
    .select('id, client_id, storage_path, latitude, longitude, note, favorite, source, taken_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(CLOUD_PHOTO_PAGE_SIZE + 1);
  if (cursor) query = query.lt('id', cursor.id);

  const { data, error } = await query;
  if (error) throw error;

  const { items: pageItems, nextCursor } = splitIdPage((data ?? []) as CloudPhoto[], CLOUD_PHOTO_PAGE_SIZE);
  const items = await Promise.all(pageItems.map(async (photo) => ({
    ...photo,
    signedUrl: await signedPhotoUrl(photo.storage_path),
  })));

  return {
    items,
    nextCursor,
  };
}

export async function listPhotoChanges(userId: string, afterVersion: number): Promise<RemotePhotoChange[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('client_id, storage_path, latitude, longitude, note, favorite, source, taken_at, updated_at, deleted_at, server_version')
    .eq('user_id', userId)
    .gt('server_version', afterVersion)
    .order('server_version', { ascending: true })
    .limit(PHOTO_CHANGES_PAGE_SIZE);
  if (error) throw error;
  return (data ?? []) as RemotePhotoChange[];
}

export async function signedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeCloudPhotoFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function applyCloudDeletion(
  deletion: { clientId: string; ownerId: string; remotePath: string; deletedAt: Date },
): Promise<{ applied: boolean; storagePath: string }> {
  const { data: existing, error: lookupError } = await supabase
    .from('photos')
    .select('storage_path, updated_at, deleted_at')
    .eq('client_id', deletion.clientId)
    .eq('user_id', deletion.ownerId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) return { applied: true, storagePath: deletion.remotePath };

  const remote = existing as RemotePhotoLookup;
  if (remote.deleted_at) return { applied: true, storagePath: remote.storage_path };
  if (new Date(remote.updated_at).getTime() > deletion.deletedAt.getTime()) {
    return { applied: false, storagePath: remote.storage_path };
  }

  const deletedAt = deletion.deletedAt.toISOString();
  const { data: deleted, error: deleteError } = await supabase
    .from('photos')
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq('client_id', deletion.clientId)
    .eq('user_id', deletion.ownerId)
    .is('deleted_at', null)
    .lte('updated_at', deletedAt)
    .select('storage_path')
    .maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) return { applied: false, storagePath: remote.storage_path };

  return { applied: true, storagePath: deleted.storage_path };
}

export async function deleteCloudPhoto(clientId: string, userId: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('photos')
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('storage_path')
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  await removeCloudPhotoFile(data.storage_path);
}
