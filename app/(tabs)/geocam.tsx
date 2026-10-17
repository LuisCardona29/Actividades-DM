import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useCamera } from '@/hooks/useCamera';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { usePhotos } from '@/hooks/usePhotos';
import { useShake } from '@/hooks/useShake';

export default function GeoCamScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const camera = useCamera();
  const geoLocation = useGeoLocation();
  const [query, setQuery] = useState('');
  const [albumFilterId, setAlbumFilterId] = useState<number | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [editingAlbumId, setEditingAlbumId] = useState<number | null>(null);
  const [shakeToClear, setShakeToClear] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotos(session?.user.id ?? null, { search: query, albumId: albumFilterId, favoritesOnly });
  const clearPhotos = photos.clearAll;

  const handleShake = useCallback(() => {
    setShakeCount((count) => count + 1);
    if (shakeToClear) {
      void clearPhotos().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'No se pudo vaciar la galeria.');
      });
    }
  }, [clearPhotos, shakeToClear]);
  const { isAvailable } = useShake(handleShake, { threshold: 1.8, cooldownMs: 1000 });

  const storePhoto = async (uri: string, source: 'camera' | 'gallery'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await photos.addPhoto({ uri, source, coords: geoLocation.coords, albumId: selectedAlbumId });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la foto.');
    } finally {
      setBusy(false);
    }
  };

  const capturePhoto = async (): Promise<void> => {
    try {
      setError(null);
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (result?.uri) await storePhoto(result.uri, 'camera');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo tomar la foto.');
    }
  };

  const importPhoto = async (): Promise<void> => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Se necesita permiso de fotos para importar una imagen.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled && result.assets[0]) {
        await storePhoto(result.assets[0].uri, 'gallery');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo abrir la galeria.');
    }
  };

  const saveAlbum = async (): Promise<void> => {
    const name = albumName.trim();
    if (!name) return;

    try {
      if (editingAlbumId === null) {
        const album = await photos.createAlbum({ name });
        setSelectedAlbumId(album.id);
        setAlbumFilterId(album.id);
      } else {
        await photos.renameAlbum(editingAlbumId, name);
      }
      setAlbumName('');
      setEditingAlbumId(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el album.');
    }
  };

  const confirmRemoveAlbum = (albumId: number, name: string): void => {
    Alert.alert('Eliminar album', `Las fotos de "${name}" se conservaran sin album.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await photos.removeAlbum(albumId);
              if (albumFilterId === albumId) setAlbumFilterId(null);
              if (selectedAlbumId === albumId) setSelectedAlbumId(null);
              if (editingAlbumId === albumId) {
                setEditingAlbumId(null);
                setAlbumName('');
              }
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'No se pudo eliminar el album.');
            }
          })();
        },
      },
    ]);
  };

  const confirmClearPhotos = (): void => {
    Alert.alert('Eliminar todas las fotos', 'Se borraran los registros y archivos locales, y tambien las copias respaldadas. Necesitas conexion para borrar copias de la nube.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar todo', style: 'destructive', onPress: () => { void photos.clearAll().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo vaciar la galeria.')); } },
    ]);
  };

  const syncPendingPhotos = async (): Promise<void> => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const result = await photos.syncPending();
      if (result.total === 0) {
        Alert.alert('Todo sincronizado', 'No hay fotos pendientes.');
      } else if (result.failed === 0) {
        Alert.alert('Respaldo completado', `${result.synced} fotos subidas.`);
      } else {
        Alert.alert('Respaldo parcial', `${result.synced} subidas; ${result.failed} pendientes.\n${result.failures.slice(0, 2).join('\n')}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo sincronizar la galeria.');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>GeoCam offline</Text>
          <Text style={styles.title}>Fotos con lugar</Text>
        </View>
        <Text style={styles.total}>{photos.photos.length} {photos.photos.length === 1 ? 'foto' : 'fotos'}</Text>
      </View>

      <View style={styles.cameraCard}>
        {photos.error || error ? <Text style={styles.errorText}>{error ?? photos.error?.message}</Text> : null}
        {geoLocation.status === 'granted' ? (
          <Text style={styles.locationState}>
            Ubicacion lista: {geoLocation.coords ? `${geoLocation.coords.latitude.toFixed(4)}, ${geoLocation.coords.longitude.toFixed(4)}` : 'obteniendo GPS...'}
          </Text>
        ) : geoLocation.status === 'blocked' ? (
          <Pressable onPress={() => { void geoLocation.openSettings(); }}><Text style={styles.locationAction}>Ubicacion bloqueada - Abrir Ajustes</Text></Pressable>
        ) : (
          <Pressable onPress={() => { void geoLocation.requestPermission(); }}><Text style={styles.locationAction}>Activar GPS para guardar coordenadas</Text></Pressable>
        )}

        <Text style={styles.albumHint}>
          Album de nuevas fotos: {photos.albums.find((album) => album.id === selectedAlbumId)?.name ?? 'Sin album'}
        </Text>
        {camera.status === 'granted' ? (
          <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraPlaceholderText}>Concede permiso para capturar fotos.</Text>
            <Pressable style={styles.secondaryButton} onPress={() => { void camera.requestPermission(); }} disabled={camera.loading}>
              <Text style={styles.secondaryButtonText}>{camera.loading ? 'Solicitando...' : 'Activar camara'}</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.cameraActions}>
          <Pressable style={styles.captureButton} onPress={() => { void capturePhoto(); }} disabled={camera.status !== 'granted' || busy}>
            <Text style={styles.captureButtonText}>{busy ? 'Guardando...' : 'Tomar foto'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => { void importPhoto(); }} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Importar</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Albumes</Text>
        <View style={styles.albumForm}>
          <TextInput
            value={albumName}
            onChangeText={setAlbumName}
            placeholder={editingAlbumId === null ? 'Nuevo album' : 'Cambiar nombre del album'}
            placeholderTextColor="#8b95a9"
            style={styles.input}
          />
          <Pressable style={styles.smallButton} onPress={() => { void saveAlbum(); }}>
            <Text style={styles.smallButtonText}>{editingAlbumId === null ? 'Crear' : 'Guardar'}</Text>
          </Pressable>
        </View>
        <View style={styles.albumList}>
          {photos.albums.map((album) => (
            <View key={album.id} style={styles.albumRow}>
              <Pressable style={[styles.albumChip, selectedAlbumId === album.id && styles.albumChipSelected]} onPress={() => setSelectedAlbumId(album.id)}>
                <Text style={[styles.albumChipText, selectedAlbumId === album.id && styles.albumChipTextSelected]}>{album.name}</Text>
              </Pressable>
              <Pressable onPress={() => { setEditingAlbumId(album.id); setAlbumName(album.name); }} accessibilityLabel={`Editar album ${album.name}`}>
                <Text style={styles.textAction}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => confirmRemoveAlbum(album.id, album.name)} accessibilityLabel={`Eliminar album ${album.name}`}>
                <Text style={styles.deleteAction}>Eliminar</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={[styles.albumChip, selectedAlbumId === null && styles.albumChipSelected]} onPress={() => setSelectedAlbumId(null)}>
            <Text style={[styles.albumChipText, selectedAlbumId === null && styles.albumChipTextSelected]}>Sin album</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Biblioteca</Text>
          <View style={styles.libraryActions}>
            <Pressable style={styles.syncButton} onPress={() => { void syncPendingPhotos(); }} disabled={syncBusy}>
              {syncBusy ? <Text style={styles.syncLabel}>{photos.syncProgress?.completed ?? 0}/{photos.syncProgress?.total ?? 0}</Text> : <Ionicons name="cloud-upload-outline" size={17} color="#c2410c" />}
              <Text style={styles.syncLabel}>{syncBusy ? 'Subiendo' : 'Sincronizar'}</Text>
            </Pressable>
            <Pressable onPress={confirmClearPhotos}><Text style={styles.deleteAction}>Vaciar</Text></Pressable>
          </View>
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder="Buscar en notas" placeholderTextColor="#8b95a9" style={styles.input} />
        <View style={styles.filterHeader}>
          <Text style={styles.filterLabel}>Solo favoritas</Text>
          <Switch value={favoritesOnly} onValueChange={setFavoritesOnly} trackColor={{ true: '#ff8a66' }} />
        </View>
        <View style={styles.albumList}>
          <Pressable style={[styles.albumChip, albumFilterId === null && styles.albumChipSelected]} onPress={() => setAlbumFilterId(null)}>
            <Text style={[styles.albumChipText, albumFilterId === null && styles.albumChipTextSelected]}>Todos</Text>
          </Pressable>
          {photos.albums.map((album) => (
            <Pressable key={album.id} style={[styles.albumChip, albumFilterId === album.id && styles.albumChipSelected]} onPress={() => setAlbumFilterId(album.id)}>
              <Text style={[styles.albumChipText, albumFilterId === album.id && styles.albumChipTextSelected]}>{album.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.photoGrid}>
          {photos.photos.map((photo) => (
            <Pressable
              key={photo.id}
              style={styles.photoTile}
              onPress={() => { router.push({ pathname: '/photo/[id]', params: { id: String(photo.id) } } as never); }}
            >
              <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
              <Text numberOfLines={1} style={styles.photoNote}>{photo.note || 'Sin nota'}</Text>
              <Text style={styles.photoMeta}>{photo.favorite ? 'Favorita' : photo.albumName ?? 'Sin album'}</Text>
              <View style={styles.syncState}>
                <Ionicons
                  name={photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt ? 'cloud-done-outline' : 'cloud-upload-outline'}
                  size={13}
                  color={photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt ? '#16835d' : '#98a2b3'}
                />
                <Text style={styles.photoMeta}>{photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt ? 'En nube' : 'Pendiente'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        {photos.photos.length === 0 ? <Text style={styles.empty}>Aun no hay fotos en este filtro.</Text> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Sensor de movimiento</Text>
        <View style={styles.filterHeader}>
          <View style={styles.shakeCopy}>
            <Text style={styles.filterLabel}>Vaciar biblioteca al agitar</Text>
            <Text style={styles.helper}>Desactivado por defecto. Al activarlo, una sacudida elimina fotos y archivos.</Text>
          </View>
          <Switch value={shakeToClear} onValueChange={setShakeToClear} trackColor={{ true: '#ff8a66' }} />
        </View>
        <Text style={styles.sensorText}>
          {isAvailable === true ? 'Acelerometro disponible' : isAvailable === false ? 'Acelerometro no disponible' : 'Comprobando sensor...'}
          {'  '}- {shakeCount} sacudidas
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#f5f7fb', flexGrow: 1, gap: 16, padding: 18, paddingBottom: 100 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  eyebrow: { color: '#ff6b3d', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#121a2b', fontSize: 28, fontWeight: '800', marginTop: 4 },
  total: { color: '#667085', fontSize: 13, fontWeight: '800' },
  cameraCard: { backgroundColor: '#121a2b', borderRadius: 20, gap: 12, overflow: 'hidden', padding: 14 },
  locationState: { color: '#d7dff2', fontSize: 12 },
  locationAction: { color: '#ffb09a', fontSize: 13, fontWeight: '800' },
  albumHint: { color: '#d7dff2', fontSize: 12 },
  errorText: { color: '#fecaca', fontSize: 13, fontWeight: '700' },
  cameraPreview: { borderRadius: 12, height: 220, overflow: 'hidden', width: '100%' },
  cameraPlaceholder: { alignItems: 'center', backgroundColor: '#20283a', borderRadius: 12, gap: 12, justifyContent: 'center', minHeight: 170, padding: 18 },
  cameraPlaceholderText: { color: '#d7dff2', fontSize: 13, textAlign: 'center' },
  cameraActions: { flexDirection: 'row', gap: 10 },
  captureButton: { alignItems: 'center', backgroundColor: '#ff6b3d', borderRadius: 11, flex: 1, justifyContent: 'center', padding: 12 },
  captureButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#30394d', borderRadius: 11, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  secondaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  panel: { backgroundColor: '#fff', borderRadius: 18, gap: 12, padding: 16 },
  sectionTitle: { color: '#121a2b', fontSize: 19, fontWeight: '800' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  libraryActions: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  syncButton: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  syncLabel: { color: '#c2410c', fontSize: 11, fontWeight: '800' },
  albumForm: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#f5f7fb', borderRadius: 11, color: '#121a2b', flex: 1, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  smallButton: { backgroundColor: '#ff6b3d', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  albumList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  albumRow: { alignItems: 'center', backgroundColor: '#f5f7fb', borderRadius: 12, flexDirection: 'row', gap: 9, paddingHorizontal: 9, paddingVertical: 6 },
  albumChip: { backgroundColor: '#f5f7fb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  albumChipSelected: { backgroundColor: '#121a2b' },
  albumChipText: { color: '#4b5565', fontSize: 12, fontWeight: '700' },
  albumChipTextSelected: { color: '#fff' },
  textAction: { color: '#475467', fontSize: 11, fontWeight: '700' },
  deleteAction: { color: '#c2410c', fontSize: 12, fontWeight: '800' },
  filterHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filterLabel: { color: '#344054', fontSize: 13, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { backgroundColor: '#fff', borderColor: '#eef1f5', borderRadius: 12, borderWidth: 1, overflow: 'hidden', width: '48%' },
  thumbnail: { aspectRatio: 1, backgroundColor: '#e4e7ec', width: '100%' },
  photoNote: { color: '#121a2b', fontSize: 12, fontWeight: '800', paddingHorizontal: 9, paddingTop: 8 },
  photoMeta: { color: '#667085', fontSize: 10, padding: 9, paddingTop: 4 },
  syncState: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingHorizontal: 7, paddingBottom: 7 },
  empty: { color: '#667085', fontSize: 13, paddingVertical: 10, textAlign: 'center' },
  shakeCopy: { flex: 1, paddingRight: 8 },
  helper: { color: '#667085', fontSize: 11, lineHeight: 16, marginTop: 4 },
  sensorText: { color: '#667085', fontSize: 12 },
});
