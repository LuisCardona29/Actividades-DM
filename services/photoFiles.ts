import { Directory, File, Paths } from 'expo-file-system';
import { signedPhotoUrl } from '@/services/cloudPhotos';

const photosDirectory = new Directory(Paths.document, 'geocam-photos');

export async function persistPhotoFile(cacheUri: string): Promise<string> {
  photosDirectory.create({ idempotent: true, intermediates: true });

  const source = new File(cacheUri);
  if (!source.exists) throw new Error('No se encontro el archivo de origen. Vuelve a seleccionar la foto.');
  const extension = source.extension || '.jpg';
  const destination = new File(photosDirectory, `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}${extension}`);
  try {
    await source.copy(destination);
    if (!destination.exists) throw new Error('No se pudo conservar la foto en el almacenamiento local.');
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }

  return destination.uri;
}

export function deletePhotoFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}

export async function downloadPhotoFile(storagePath: string, clientId: string): Promise<string> {
  photosDirectory.create({ idempotent: true, intermediates: true });

  const extension = storagePath.split('.').pop()?.toLowerCase();
  const safeExtension = extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'jpg';
  const destination = new File(photosDirectory, `${clientId}.${safeExtension}`);
  if (destination.exists) return destination.uri;

  const url = await signedPhotoUrl(storagePath);
  return (await File.downloadFileAsync(url, destination)).uri;
}
