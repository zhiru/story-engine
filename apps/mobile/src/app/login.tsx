import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../theme/AppThemeContext';
import { ApiError } from '../lib/api';

export default function LoginScreen() {
  const { signIn, register } = useAuth();
  const theme = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await register({ name, email, password });
      } else {
        await signIn({ email, password });
      }
    } catch (e: unknown) {
      // SUSPENDED e afins chegam com mensagem do servidor — exibir como está.
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Erro inesperado. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.primary }]}>
        {theme.appName ?? 'StoryGen'}
      </Text>
      <Text style={styles.subtitle}>{isRegister ? 'Criar conta' : 'Entrar'}</Text>

      {isRegister && (
        <TextInput
          style={styles.input}
          placeholder="Nome"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          accessibilityLabel="Nome"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        placeholderTextColor="#9CA3AF"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="E-mail"
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        placeholderTextColor="#9CA3AF"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Senha"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }, loading && styles.buttonDisabled]}
        onPress={() => { void handleSubmit(); }}
        disabled={loading}
        accessible
        accessibilityRole="button"
        accessibilityLabel={isRegister ? 'Criar conta' : 'Entrar'}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isRegister ? 'Criar conta' : 'Entrar'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setIsRegister((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={
          isRegister ? 'Já tenho uma conta, entrar' : 'Não tenho conta, criar uma'
        }
      >
        <Text style={[styles.toggle, { color: theme.primary }]}>
          {isRegister ? 'Já tem uma conta? Entrar' : 'Não tem uma conta? Cadastre-se'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#666', marginBottom: 24 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16, color: '#1E1B4B' },
  button: { width: '100%', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error: { color: '#DC2626', marginBottom: 8, textAlign: 'center' },
  toggle: { marginTop: 16, fontSize: 14 },
});
