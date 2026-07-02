import { useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../theme/AppThemeContext';
import { ApiError } from '../lib/api';

const CURRENT_POLICY_VERSION = '1.0';

export default function ConsentScreen() {
  const { grantConsent, signOut } = useAuth();
  const theme = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsent() {
    setError(null);
    setLoading(true);
    try {
      await grantConsent({
        consent_type: 'PARENTAL_DATA',
        policy_version: CURRENT_POLICY_VERSION,
        granted: true,
      });
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Erro inesperado. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  const appName = theme.appName ?? 'StoryGen';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: theme.primary }]} accessibilityRole="header">
        Consentimento parental
      </Text>
      <Text style={styles.body}>
        O {appName} cria histórias personalizadas para crianças. Para continuar,
        precisamos do seu consentimento para tratar os dados da criança de acordo
        com a nossa Política de Privacidade (v{CURRENT_POLICY_VERSION}).
      </Text>
      <Text style={styles.body}>
        Ao tocar em &ldquo;Eu concordo&rdquo;, você confirma que é o pai, a mãe ou o
        responsável legal e consente com a coleta e o uso dos dados da criança
        conforme descrito na nossa Política de Privacidade.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }, loading && styles.buttonDisabled]}
        onPress={() => { void handleConsent(); }}
        disabled={loading}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Eu concordo com a Política de Privacidade"
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Eu concordo</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => { void signOut(); }}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
      >
        <Text style={styles.secondaryText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  body: { fontSize: 15, color: '#444', marginBottom: 12, textAlign: 'center', lineHeight: 22 },
  button: { width: '100%', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { marginTop: 12, padding: 12 },
  secondaryText: { color: '#666', fontSize: 14 },
  error: { color: '#DC2626', marginBottom: 8, textAlign: 'center' },
});
