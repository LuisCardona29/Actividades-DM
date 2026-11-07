import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import {
  deleteCloudPhoto,
  listCloudPhotosPage,
  type CloudPhotoCursor,
} from '@/services/cloudPhotos';

export function useCloudPhotos(ownerId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ['cloudPhotos', ownerId],
    queryFn: ({ pageParam }) => {
      if (!ownerId) throw new Error('Inicia sesion para consultar las fotos de la nube.');
      return listCloudPhotosPage(ownerId, pageParam);
    },
    initialPageParam: null as CloudPhotoCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: ownerId !== null,
  });

  const photos = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  return { ...query, photos };
}

export function useDeleteCloudPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, ownerId }: { clientId: string; ownerId: string }) =>
      deleteCloudPhoto(clientId, ownerId),
    onSettled: (_data, _error, variables) => queryClient.invalidateQueries({
      queryKey: ['cloudPhotos', variables.ownerId],
    }),
  });
}

export function useCloudPhotosRealtime(ownerId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ownerId) return;

    const channel = supabase
      .channel(`geocam-cloud-${ownerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'photos',
        filter: `user_id=eq.${ownerId}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['cloudPhotos', ownerId] });
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[GeoCam cloud realtime]', error ?? status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ownerId, queryClient]);
}
