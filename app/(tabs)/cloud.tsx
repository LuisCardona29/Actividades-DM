import { useAuth } from '@/context/AuthContext';
import { useCloudPhotos, useCloudPhotosRealtime, useDeleteCloudPhoto } from '@/hooks/useCloudPhotos';
import { usePhotos } from '@/hooks/usePhotos';
import { useIsOnline } from '@/lib/queryClient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function CloudScreen() {
  const { session, signOut } = useAuth();
  const ownerId = session?.user.id ?? null;
  const cloud = useCloudPhotos(ownerId);
  useCloudPhotosRealtime(ownerId);
  const deleteCloudMutation = useDeleteCloudPhoto();
  const localPhotos = usePhotos(ownerId);
  const isOnline = useIsOnline();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAll = async (): Promise<void> => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await localPhotos.syncPending();
      await cloud.refetch();
      const changed = result.pulled + result.pushed + result.deleted;
      if (result.failed === 0) {
        Alert.alert(
          changed === 0 ? 'Todo sincronizado' : 'Sincronizacion completada',
          changed === 0
            ? 'SQLite y Supabase ya estan al dia.'
            : `${result.pulled} descargadas, ${result.pushed} subidas y ${result.deleted} borradas.`,
        );
      } else {
        Alert.alert(
          'Sincronizacion parcial',
          `${result.pulled} descargadas, ${result.pushed} subidas y ${result.deleted} borradas; ${result.failed} pendientes.\n${result.failures.slice(0, 2).join('\n')}`,
        );
      }
    } catch (reason) {
      Alert.alert('No se pudo sincronizar', reason instanceof Error ? reason.message : 'Verifica tu conexion.');
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmDelete = (clientId: string): void => {
    if (!ownerId) return;
    Alert.alert('Eliminar foto respaldada', 'La eliminacion se sincronizara con tus otros dispositivos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => deleteCloudMutation.mutate(
          { clientId, ownerId },
          {
            onError: (reason) => Alert.alert(
              'No se pudo eliminar',
              reason instanceof Error ? reason.message : 'Intenta de nuevo.',
            ),
          },
        ),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>RESPALDO EN SUPABASE</Text>
          <Text style={styles.title}>Tu nube</Text>
          <Text style={styles.account}>{session?.user.email}</Text>
        </View>
        <Pressable style={styles.signOut} onPress={() => { void signOut().catch((error: unknown) => Alert.alert('No se pudo cerrar sesion', error instanceof Error ? error.message : 'Intenta de nuevo.')); }} accessibilityRole="button" accessibilityLabel="Cerrar sesion">
          <Ionicons name="log-out-outline" size={21} color="#344054" />
        </Pressable>
      </View>

      <Pressable style={[styles.syncButton, (isSyncing || !isOnline) && styles.syncButtonBusy]} onPress={() => { void syncAll(); }} disabled={isSyncing || !isOnline}>
        {isSyncing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="cloud-upload-outline" size={19} color="#fff" />}
        <Text style={styles.syncText}>
          {isSyncing && localPhotos.syncProgress
            ? `Sincronizando ${localPhotos.syncProgress.completed} de ${localPhotos.syncProgress.total}`
            : isSyncing ? 'Preparando sincronizacion...' : isOnline ? 'Sincronizar cambios' : 'Sin conexion'}
        </Text>
      </Pressable>

      {!isOnline ? <Text style={styles.offline}>Sin conexion. Se muestran las fotos guardadas en cache; los cambios se sincronizaran al reconectar.</Text> : null}
      {cloud.isError ? (
        <View style={styles.errorPanel}>
          <Text style={styles.error}>{cloud.error instanceof Error ? cloud.error.message : 'No se pudo cargar tu respaldo.'}</Text>
          <Pressable style={styles.retryButton} onPress={() => { void cloud.refetch(); }}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Fotos respaldadas</Text>
        <Text style={styles.count}>{cloud.photos.length}{cloud.hasNextPage ? '+' : ''}</Text>
      </View>

      {cloud.isPending && cloud.fetchStatus === 'paused' ? (
        <Text style={styles.emptyCopy}>Conectate a internet para consultar la nube por primera vez.</Text>
      ) : null}
      {cloud.isPending && cloud.fetchStatus === 'fetching' ? <ActivityIndicator style={styles.loader} color="#ff6b3d" /> : null}
      {cloud.data !== undefined ? (
        <FlatList
          data={cloud.photos}
          keyExtractor={(photo) => photo.client_id}
          refreshing={cloud.isRefetching && !cloud.isFetchingNextPage}
          onRefresh={() => { void cloud.refetch(); }}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (cloud.hasNextPage && !cloud.isFetchingNextPage && !cloud.isFetchNextPageError) {
              void cloud.fetchNextPage();
            }
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="cloud-outline" size={34} color="#98a2b3" />
              <Text style={styles.emptyTitle}>Aun no hay fotos en la nube</Text>
              <Text style={styles.emptyCopy}>Sincroniza las fotos locales para encontrarlas desde otros dispositivos.</Text>
            </View>
          )}
          ListFooterComponent={(
            cloud.isFetchingNextPage
              ? <ActivityIndicator style={styles.loader} color="#ff6b3d" />
              : cloud.isFetchNextPageError
                ? <Pressable style={styles.retryButton} onPress={() => { void cloud.fetchNextPage(); }}><Text style={styles.retryText}>Reintentar carga</Text></Pressable>
                : cloud.hasNextPage
                  ? <Pressable style={styles.retryButton} onPress={() => { void cloud.fetchNextPage(); }}><Text style={styles.retryText}>Cargar mas fotos</Text></Pressable>
                  : cloud.photos.length > 0 ? <Text style={styles.endOfList}>Has llegado al final</Text> : null
          )}
          renderItem={({ item }) => (
            <View style={styles.photoCard}>
              <Image source={{ uri: item.signedUrl }} style={styles.photo} />
              <View style={styles.photoInfo}>
                <View style={styles.photoTitleRow}>
                  <Text style={styles.photoTitle} numberOfLines={1}>{item.note || 'Foto GeoCam'}</Text>
                  {item.favorite ? <Ionicons name="heart" size={16} color="#e45745" /> : null}
                  <Pressable
                    onPress={() => confirmDelete(item.client_id)}
                    disabled={deleteCloudMutation.isPending || !isOnline}
                    accessibilityRole="button"
                    accessibilityLabel="Eliminar foto respaldada"
                    style={styles.deleteButton}
                  >
                    {deleteCloudMutation.isPending
                      ? <ActivityIndicator size="small" color="#b42318" />
                      : <Ionicons name="trash-outline" size={18} color="#b42318" />}
                  </Pressable>
                </View>
                <Text style={styles.meta}>{item.source === 'camera' ? 'Camara' : 'Galeria'} · {new Date(item.taken_at).toLocaleString('es-CO')}</Text>
                <Text style={styles.meta}>
                  {item.latitude !== null && item.longitude !== null
                    ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                    : 'Sin coordenadas'}
                </Text>
              </View>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f4f7fb', flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  eyebrow: { color: '#d64f2e', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#141b2d', fontSize: 29, fontWeight: '800', marginTop: 3 },
  account: { color: '#667085', fontSize: 12, marginTop: 4 },
  signOut: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, height: 42, justifyContent: 'center', width: 42 },
  syncButton: { alignItems: 'center', backgroundColor: '#ff6b3d', borderRadius: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  syncButtonBusy: { opacity: 0.82 },
  syncText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  offline: { backgroundColor: '#fef3c7', borderRadius: 9, color: '#92400e', fontSize: 12, lineHeight: 18, marginTop: 10, padding: 9 },
  errorPanel: { alignItems: 'center', gap: 8, paddingTop: 18 },
  error: { color: '#b42318', fontSize: 12, textAlign: 'center' },
  retryButton: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: 10, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: '#344054', fontSize: 12, fontWeight: '800' },
  loader: { margin: 20 },
  listHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  sectionTitle: { color: '#141b2d', fontSize: 18, fontWeight: '800' },
  count: { color: '#667085', fontSize: 12, fontWeight: '700' },
  listContent: { gap: 12, paddingBottom: 100, paddingTop: 12 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 26, paddingVertical: 56 },
  emptyTitle: { color: '#344054', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptyCopy: { color: '#667085', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  photoCard: { backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden' },
  photo: { aspectRatio: 1.2, backgroundColor: '#e4e7ec', width: '100%' },
  photoInfo: { gap: 5, padding: 13 },
  photoTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  photoTitle: { color: '#141b2d', flex: 1, fontSize: 14, fontWeight: '800' },
  meta: { color: '#667085', fontSize: 11 },
  deleteButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  endOfList: { color: '#667085', fontSize: 11, padding: 16, textAlign: 'center' },
});
