import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { usePhotos } from '@/hooks/usePhotos';

export default function PhotoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const photoId = Number(id);
  const photos = usePhotos();
  const photo = photos.photos.find((item) => item.id === photoId);
  const savedNote = photo?.note ?? '';
  const savedAlbumId = photo?.albumId ?? null;
  const savedFavorite = photo?.favorite ?? false;
  const photoReady = photo !== undefined;
  const [note, setNote] = useState('');
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photoReady) return;
    setNote(savedNote);
    setAlbumId(savedAlbumId);
    setFavorite(savedFavorite);
  }, [photoReady, savedNote, savedAlbumId, savedFavorite]);

  const saveChanges = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await photos.updatePhoto(photoId, { note: note.trim() || null, albumId, favorite });
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron guardar los cambios.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (): void => {
    Alert.alert('Eliminar foto', 'Tambien se borrara el archivo permanente del dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void photos.removePhoto(photoId).then(() => router.back()).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'No se pudo eliminar la foto.');
          });
        },
      },
    ]);
  };

  if (!photo) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyTitle}>Foto no encontrada</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.backText}>Volver a GeoCam</Text></Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}><Text style={styles.backText}>‹  GeoCam</Text></Pressable>
      <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="contain" />
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{photo.source === 'camera' ? 'Capturada con GeoCam' : 'Importada de galeria'}</Text>
            <Text style={styles.title}>{photo.createdAt.toLocaleString('es-CO')}</Text>
          </View>
          <Text style={styles.coordinates}>
            {photo.latitude !== null && photo.longitude !== null
              ? `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`
              : 'Sin coordenadas'}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.label}>Nota</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Agrega un recuerdo o descripcion" placeholderTextColor="#8b95a9" style={styles.input} multiline />

        <View style={styles.favoriteRow}>
          <Text style={styles.label}>Favorita</Text>
          <Switch value={favorite} onValueChange={setFavorite} trackColor={{ true: '#ff8a66' }} />
        </View>

        <Text style={styles.label}>Album</Text>
        <View style={styles.albumList}>
          <Pressable style={[styles.albumChip, albumId === null && styles.albumChipActive]} onPress={() => setAlbumId(null)}>
            <Text style={[styles.albumText, albumId === null && styles.albumTextActive]}>Sin album</Text>
          </Pressable>
          {photos.albums.map((album) => (
            <Pressable key={album.id} style={[styles.albumChip, albumId === album.id && styles.albumChipActive]} onPress={() => setAlbumId(album.id)}>
              <Text style={[styles.albumText, albumId === album.id && styles.albumTextActive]}>{album.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.saveButton} onPress={() => { void saveChanges(); }} disabled={busy}>
          <Text style={styles.saveText}>{busy ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Eliminar foto y archivo</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#f5f7fb', flexGrow: 1, gap: 16, padding: 18, paddingBottom: 40 },
  emptyScreen: { alignItems: 'center', backgroundColor: '#f5f7fb', flex: 1, gap: 14, justifyContent: 'center' },
  emptyTitle: { color: '#121a2b', fontSize: 20, fontWeight: '800' },
  backText: { color: '#c2410c', fontSize: 14, fontWeight: '800' },
  photo: { backgroundColor: '#121a2b', borderRadius: 18, height: 360, width: '100%' },
  panel: { backgroundColor: '#fff', borderRadius: 18, gap: 14, padding: 18 },
  header: { gap: 8 },
  eyebrow: { color: '#ff6b3d', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#121a2b', fontSize: 18, fontWeight: '800', marginTop: 4 },
  coordinates: { color: '#667085', fontSize: 12 },
  error: { color: '#b42318', fontSize: 13, fontWeight: '700' },
  label: { color: '#344054', fontSize: 13, fontWeight: '800' },
  input: { backgroundColor: '#f5f7fb', borderRadius: 11, color: '#121a2b', minHeight: 46, padding: 12, textAlignVertical: 'top' },
  favoriteRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  albumList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  albumChip: { backgroundColor: '#f5f7fb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  albumChipActive: { backgroundColor: '#121a2b' },
  albumText: { color: '#4b5565', fontSize: 12, fontWeight: '700' },
  albumTextActive: { color: '#fff' },
  saveButton: { alignItems: 'center', backgroundColor: '#ff6b3d', borderRadius: 12, marginTop: 4, padding: 14 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  deleteButton: { alignItems: 'center', borderColor: '#fda29b', borderRadius: 12, borderWidth: 1, padding: 12 },
  deleteText: { color: '#b42318', fontSize: 13, fontWeight: '800' },
});