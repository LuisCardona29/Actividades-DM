import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { db, expoDb } from '@/db/client';
import { seedAlbums } from '@/db/seed';
import migrations from '@/drizzle/migrations';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;

    void seedAlbums()
      .then(() => {
        expoDb.execSync(`
          CREATE TRIGGER IF NOT EXISTS albums_set_photo_album_null
          BEFORE DELETE ON albums
          BEGIN
            UPDATE photos SET album_id = NULL WHERE album_id = OLD.id;
          END;
        `);
        setSeeded(true);
      })
      .catch((reason: unknown) => {
        setSeedError(reason instanceof Error ? reason.message : 'No se pudo preparar la base de datos.');
      });
  }, [success]);

  if (error || seedError) {
    return (
      <View style={styles.message}>
        <Text style={styles.errorTitle}>No se pudo iniciar GeoCam</Text>
        <Text style={styles.errorText}>{error?.message ?? seedError}</Text>
      </View>
    );
  }

  if (!success || !seeded) {
    return (
      <View style={styles.message}>
        <ActivityIndicator color="#ff6b3d" />
        <Text style={styles.loadingText}>Preparando la galeria offline...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f4f7fb' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="student/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="photo/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  message: { alignItems: 'center', backgroundColor: '#f5f7fb', flex: 1, justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#b42318', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#667085', fontSize: 14, marginTop: 8, textAlign: 'center' },
  loadingText: { color: '#667085', fontSize: 14, marginTop: 12 },
});
