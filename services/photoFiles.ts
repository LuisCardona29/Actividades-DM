import { Directory, File, Paths } from 'expo-file-system';
import { signedPhotoUrl } from '@/services/cloudPhotos';

const photosDirectory = new Directory(Paths.document, 'geocam-photos');

export function persistPhotoFile(cacheUri: string): string {
  photosDirectory.create({ idempotent: true, intermediates: true });

  const source = new File(cacheUri);
  const extension = source.extension || '.jpg';
  const destination = new File(photosDirectory, `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}${extension}`);
  source.copy(destination);

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