import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { initializeGeoCam } from '@/db/migrations';
import { photosRepo } from '@/db/repositories/photos';
import { supabaseConfigured } from '@/lib/supabase';

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const [ownerPreparation, setOwnerPreparation] = useState<{ ownerId: string; error: string | null } | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    void photosRepo.ensureOwner(session.user.id)
      .then(() => photosRepo.ensureLocalOwner(session.user.id))
      .then(() => {
        if (!cancelled) setOwnerPreparation({ ownerId: session.user.id, error: null });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setOwnerPreparation({
          ownerId: session.user.id,
          error: reason instanceof Error ? reason.message : 'No se pudieron preparar tus fotos locales.',
        });
      });

    return () => { cancelled = true; };
  }, [session]);

  if (isLoading || (session && ownerPreparation?.ownerId !== session.user.id)) {
    return <ActivityIndicator style={styles.fullscreenLoader} color="#ff6b3d" />;
  }

  const ownerError = session && ownerPreparation?.ownerId === session.user.id
    ? ownerPreparation.error
    : null;
  if (ownerError) {
    return (
      <View style={styles.message}>
        <Text style={styles.errorTitle}>No se pudieron preparar las fotos</Text>
        <Text style={styles.errorText}>{ownerError}</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f4f7fb' }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="student/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="photo/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ title: 'Iniciar sesion' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [migrationState, setMigrationState] = useState<{ success: boolean; error: Error | null }>({ success: false, error: null });
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [startupStage, setStartupStage] = useState('apertura de SQLite');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void initializeGeoCam(setStartupStage)
      .then(() => {
        if (!cancelled) {
          setSeeded(true);
          setMigrationState({ success: true, error: null });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          const error = reason instanceof Error ? reason : new Error(`No se pudo preparar la base de datos: ${String(reason)}`);
          console.error('[GeoCam bootstrap]', error);
          setSeedError(error.message);
          setMigrationState({ success: false, error });
        }
      });
    return () => { cancelled = true; };
  }, [attempt]);

  if (migrationState.error || seedError) {
    return (
      <View style={styles.message}>
        <Text style={styles.errorTitle}>No se pudo iniciar GeoCam</Text>
        <Text style={styles.errorText}>{migrationState.error?.message ?? seedError}</Text>
        <Text onPress={() => {
          setSeedError(null);
          setMigrationState({ success: false, error: null });
          setStartupStage('reintentando apertura de SQLite');
          setAttempt((current) => current + 1);
        }} style={styles.retryText}>Tocar para reintentar</Text>
      </View>
    );
  }

  if (!migrationState.success || !seeded) {
    return (
      <View style={styles.message}>
        <ActivityIndicator color="#ff6b3d" />
        <Text style={styles.loadingText}>Preparando galeria offline: {startupStage}...</Text>
      </View>
    );
  }

  if (!supabaseConfigured) {
    return (
      <View style={styles.message}>
        <Text style={styles.errorTitle}>Configura Supabase</Text>
        <Text style={styles.errorText}>Copia .env.example a .env, agrega la URL del proyecto y la publishable key, y reinicia con npx expo start -c.</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  message: { alignItems: 'center', backgroundColor: '#f5f7fb', flex: 1, justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#b42318', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#667085', fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryText: { color: '#ff6b3d', fontSize: 15, fontWeight: '700', marginTop: 20, padding: 12 },
  loadingText: { color: '#667085', fontSize: 14, marginTop: 12 },
  fullscreenLoader: { flex: 1 },
});
