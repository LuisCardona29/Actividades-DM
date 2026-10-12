import { Directory, File, Paths } from 'expo-file-system';

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