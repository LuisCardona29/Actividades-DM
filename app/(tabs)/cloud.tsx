import { useAuth } from '@/context/AuthContext';
import { useCloudPhotos } from '@/hooks/useCloudPhotos';
import { usePhotos } from '@/hooks/usePhotos';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function CloudScreen() {
  const { session, signOut } = useAuth();
  const ownerId = session?.user.id ?? null;
  const cloud = useCloudPhotos(ownerId);
  const localPhotos = usePhotos(ownerId);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAll = async (): Promise<void> => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await localPhotos.syncPending();
      await cloud.reload();
      if (result.total === 0) {
        Alert.alert('Todo sincronizado', 'No hay fotos pendientes.');
      } else if (result.failed === 0) {
        Alert.alert('Respaldo completado', `${result.synced} fotos subidas correctamente.`);
      } else {
        Alert.alert(
          'Respaldo parcial',
          `${result.synced} subidas; ${result.failed} pendientes.\n${result.failures.slice(0, 2).join('\n')}`,
        );
      }
    } catch (reason) {
      Alert.alert('No se pudo sincronizar', reason instanceof Error ? reason.message : 'Verifica tu conexion.');
    } finally {
      setIsSyncing(false);
    }
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

      <Pressable style={[styles.syncButton, isSyncing && styles.syncButtonBusy]} onPress={() => { void syncAll(); }} disabled={isSyncing}>
        {isSyncing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="cloud-upload-outline" size={19} color="#fff" />}
        <Text style={styles.syncText}>
          {isSyncing && localPhotos.syncProgress
            ? `Sincronizando ${localPhotos.syncProgress.completed} de ${localPhotos.syncProgress.total}`
            : isSyncing ? 'Preparando respaldo...' : 'Sincronizar pendientes'}
        </Text>
      </Pressable>

      {cloud.error ? <Text style={styles.error}>{cloud.error}</Text> : null}
      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Fotos respaldadas</Text>
        <Text style={styles.count}>{cloud.photos.length}</Text>
      </View>

      <FlatList
        data={cloud.photos}
        keyExtractor={(photo) => photo.client_id}
        refreshing={cloud.isLoading}
        onRefresh={() => { void cloud.reload(); }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={(
          <View style={styles.empty}>
            {cloud.isLoading ? <ActivityIndicator color="#ff6b3d" /> : <Ionicons name="cloud-outline" size={34} color="#98a2b3" />}
            <Text style={styles.emptyTitle}>{cloud.isLoading ? 'Consultando tu respaldo...' : 'Aun no hay fotos en la nube'}</Text>
            {!cloud.isLoading ? <Text style={styles.emptyCopy}>Sincroniza las fotos locales para encontrarlas desde otros dispositivos.</Text> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.photoCard}>
            <Image source={{ uri: item.signedUrl }} style={styles.photo} />
            <View style={styles.photoInfo}>
              <View style={styles.photoTitleRow}>
                <Text style={styles.photoTitle} numberOfLines={1}>{item.note || 'Foto GeoCam'}</Text>
                {item.favorite ? <Ionicons name="heart" size={16} color="#e45745" /> : null}
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
  error: { color: '#b42318', fontSize: 12, marginTop: 10 },
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
});