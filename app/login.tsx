import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (action: typeof signIn): Promise<void> => {
    if (!email.trim() || password.length < 6) {
      setMessage('Escribe tu correo y una contrasena de al menos 6 caracteres.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action(email, password));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo conectar con Supabase.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Text style={styles.eyebrow}>GEOCAM · RESPALDO SEGURO</Text>
        <Text style={styles.title}>Tus fotos,{ '\n' }a salvo en la nube.</Text>
        <Text style={styles.copy}>Inicia sesion o crea una cuenta para respaldar tus fotos de GeoCam.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Correo electronico"
          placeholderTextColor="#7c8799"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Contrasena"
          placeholderTextColor="#7c8799"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={() => { void submit(signIn); }}>
          <Text style={styles.primaryText}>{busy ? 'Conectando...' : 'Iniciar sesion'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => { void submit(signUp); }}>
          <Text style={styles.secondaryText}>Crear cuenta</Text>
        </Pressable>
        <Text style={styles.privacy}>Tu sesion se protege en el almacenamiento seguro del dispositivo.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f4f7fb', flex: 1, justifyContent: 'center', padding: 24 },
  brand: { marginBottom: 34 },
  eyebrow: { color: '#d64f2e', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#141b2d', fontSize: 34, fontWeight: '800', lineHeight: 40, marginTop: 12 },
  copy: { color: '#667085', fontSize: 15, lineHeight: 22, marginTop: 12, maxWidth: 330 },
  form: { backgroundColor: '#fff', borderRadius: 18, gap: 12, padding: 18 },
  input: { backgroundColor: '#f4f7fb', borderRadius: 10, color: '#141b2d', fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },
  message: { color: '#b42318', fontSize: 13, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: '#ff6b3d', borderRadius: 10, paddingVertical: 14 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', borderColor: '#d0d5dd', borderRadius: 10, borderWidth: 1, paddingVertical: 13 },
  secondaryText: { color: '#344054', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  privacy: { color: '#7b8190', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});