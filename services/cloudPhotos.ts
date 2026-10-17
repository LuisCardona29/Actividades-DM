import { photosRepo } from '@/db/repositories/photos';
import type { Photo } from '@/db/schema';
import { supabase } from '@/lib/supabase';

const BUCKET = 'geocam';

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

export async function uploadPhoto(photo: Photo, userId: string): Promise<void> {
  if (!photo.clientId) throw new Error('La foto no tiene clientId. Cierra y abre GeoCam para completar su migracion.');

  const { data: existing, error: lookupError } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('client_id', photo.clientId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const storagePath = existing?.storage_path ?? photo.remotePath ?? `${userId}/${photo.clientId}.${extensionFor(photo.uri)}`;
  const arrayBuffer = await readPhotoBytes(photo.uri);
  if (arrayBuffer.byteLength === 0) throw new Error('El archivo local esta vacio; no se subio a la nube.');
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
    contentType: mimeTypeFor(photo.uri),
    upsert: Boolean(existing),
  });
  if (uploadError) throw uploadError;

  const remoteRow = {
    user_id: userId,
    client_id: photo.clientId,
    storage_path: storagePath,
    latitude: photo.latitude,
    longitude: photo.longitude,
    note: photo.note,
    favorite: photo.favorite,
    source: photo.source,
    taken_at: photo.createdAt.toISOString(),
    updated_at: (photo.updatedAt ?? photo.createdAt).toISOString(),
  };

  const { error: rowError } = await supabase
    .from('photos')
    .upsert(remoteRow, { onConflict: 'user_id,client_id' });

  if (rowError) {
    if (!existing) {
      const { error: rollbackError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (rollbackError) {
        throw new Error(`No se guardaron los metadatos y tampoco se pudo limpiar el archivo huérfano: ${rowError.message}; ${rollbackError.message}`);
      }
    }
    throw rowError;
  }

  await photosRepo.markSynced(photo.id, userId, storagePath);
}

export async function listCloudPhotos(userId: string): Promise<CloudPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, client_id, storage_path, latitude, longitude, note, favorite, source, taken_at, updated_at')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false });
  if (error) throw error;
  return data as CloudPhoto[];
}

export async function signedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteCloudPhoto(photo: Photo, userId: string): Promise<void> {
  if (!photo.clientId) throw new Error('La foto sincronizada no tiene clientId.');

  const { data: row, error: lookupError } = await supabase
    .from('photos')
    .select('*')
    .eq('client_id', photo.clientId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!row) return;

  const storagePath = row.storage_path as string;
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) throw storageError;

  const { data: deletedRows, error: deleteError } = await supabase
    .from('photos')
    .delete()
    .eq('client_id', photo.clientId)
    .eq('user_id', userId)
    .select('client_id');

  if (deleteError || !deletedRows?.length) {
    const { error: restoreFileError } = await supabase.storage.from(BUCKET).upload(
      storagePath,
      await readPhotoBytes(photo.uri),
      { contentType: mimeTypeFor(photo.uri), upsert: true },
    );
    const { error: restoreRowError } = await supabase.from('photos').upsert(row, { onConflict: 'user_id,client_id' });
    if (restoreFileError || restoreRowError) {
      throw new Error(`El borrado remoto falló y la compensación quedó incompleta: ${deleteError?.message ?? 'No se confirmó la eliminación'}; ${restoreFileError?.message ?? ''}; ${restoreRowError?.message ?? ''}`);
    }
    if (deleteError) throw deleteError;
    throw new Error('No se pudo confirmar el borrado remoto; los datos se restauraron.');
  }
}
