import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../auth/AuthContext';
import { getUniverse, type UniverseDetail } from '../../lib/api';
import AppShell from '../../components/AppShell';
import UniverseStoriesView from '../../components/UniverseStoriesView';

/**
 * Histórias de um universo aberto pela descoberta (RF-30).
 * Geração só aparece para o dono (ou admin/mod) — a API nega para os demais.
 */
export default function UniverseScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, userId, role } = useAuth();

  const [universe, setUniverse] = useState<UniverseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken) return;
    setLoading(true);
    getUniverse(id, accessToken)
      .then(setUniverse)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar universo.');
      })
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  if (loading || !accessToken) {
    return (
      <AppShell title="Universo">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error || !universe) {
    return (
      <AppShell title="Universo">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Universo não encontrado.'}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  const canGenerate =
    universe.userId === userId || role === 'ADMIN' || role === 'MODERATOR';

  return (
    <UniverseStoriesView
      universe={{
        id: universe.id,
        title: universe.title,
        description: universe.description,
      }}
      accessToken={accessToken}
      onBack={() => router.back()}
      showGenerate={canGenerate}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5FF',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
});
