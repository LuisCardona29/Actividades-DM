import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { listCloudPhotos, signedPhotoUrl, type CloudPhoto } from '@/services/cloudPhotos';

export type CloudPhotoView = CloudPhoto & { signedUrl: string };

export function useCloudPhotos(ownerId: string | null) {
  const [photos, setPhotos] = useState<CloudPhotoView[]>([]);
  const [isLoading, setIsLoading] = useState(ownerId !== null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    const currentRequest = ++requestId.current;
    if (!ownerId) {
      setPhotos([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await listCloudPhotos(ownerId);
      const photoViews = await Promise.all(rows.map(async (photo) => ({
        ...photo,
        signedUrl: await signedPhotoUrl(photo.storage_path),
      })));
      if (requestId.current === currentRequest) {
        setPhotos(photoViews);
        setError(null);
      }
    } catch (reason) {
      if (requestId.current === currentRequest) {
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar la nube.');
      }
    } finally {
      if (requestId.current === currentRequest) setIsLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      void reload();
      return;
    }

    void reload();
    const channel = supabase
      .channel(`geocam-cloud-${ownerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'photos',
        filter: `user_id=eq.${ownerId}`,
      }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      requestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [ownerId, reload]);

  return { photos, isLoading, error, reload };
}