import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { usePhotos } from '@/hooks/usePhotos';

export default function PhotoDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const photoId = Number(id);
  const photos = usePhotos(session?.user.id ?? null);
  const photo = photos.photos.find((item) => item.id === photoId);
  const [draft, setDraft] = useState<{ id: number; note: string; albumId: number | null; favorite: boolean } | null>(null);
  const note = draft?.id === photoId ? draft.note : photo?.note ?? '';
  const albumId = draft?.id === photoId ? draft.albumId : photo?.albumId ?? null;
  const favorite = draft?.id === photoId ? draft.favorite : photo?.favorite ?? false;
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const uploadToCloud = async (): Promise<void> => {
    if (syncBusy) return;
    setSyncBusy(true);
    setError(null);
    try {
      await photos.syncPhoto(photoId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo respaldar la foto.');
    } finally {
      setSyncBusy(false);
    }
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
        <TextInput value={note} onChangeText={(value) => setDraft({ id: photoId, note: value, albumId, favorite })} placeholder="Agrega un recuerdo o descripcion" placeholderTextColor="#8b95a9" style={styles.input} multiline />

        <View style={styles.favoriteRow}>
          <Text style={styles.label}>Favorita</Text>
          <Switch value={favorite} onValueChange={(value) => setDraft({ id: photoId, note, albumId, favorite: value })} trackColor={{ true: '#ff8a66' }} />
        </View>

        <Text style={styles.label}>Album</Text>
        <View style={styles.albumList}>
          <Pressable style={[styles.albumChip, albumId === null && styles.albumChipActive]} onPress={() => setDraft({ id: photoId, note, albumId: null, favorite })}>
            <Text style={[styles.albumText, albumId === null && styles.albumTextActive]}>Sin album</Text>
          </Pressable>
          {photos.albums.map((album) => (
            <Pressable key={album.id} style={[styles.albumChip, albumId === album.id && styles.albumChipActive]} onPress={() => setDraft({ id: photoId, note, albumId: album.id, favorite })}>
              <Text style={[styles.albumText, albumId === album.id && styles.albumTextActive]}>{album.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.saveButton} onPress={() => { void saveChanges(); }} disabled={busy}>
          <Text style={styles.saveText}>{busy ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>
        <Pressable style={styles.cloudButton} onPress={() => { void uploadToCloud(); }} disabled={syncBusy}>
          {syncBusy ? <Text style={styles.cloudButtonText}>Subiendo...</Text> : <Ionicons name={photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt ? 'cloud-done-outline' : 'cloud-upload-outline'} size={18} color="#fff" />}
          <Text style={styles.cloudButtonText}>{syncBusy ? 'Subiendo...' : photo.syncedAt && photo.updatedAt && photo.syncedAt >= photo.updatedAt ? 'Respaldada en la nube' : 'Subir a la nube'}</Text>
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
  cloudButton: { alignItems: 'center', backgroundColor: '#273a59', borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 13 },
  cloudButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  deleteButton: { alignItems: 'center', borderColor: '#fda29b', borderRadius: 12, borderWidth: 1, padding: 12 },
  deleteText: { color: '#b42318', fontSize: 13, fontWeight: '800' },
});
