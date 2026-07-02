import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { getConfig, listStories, listMyUniverses } from '../lib/api';
import type { StoryListItem, UniverseListItem } from '@storygen/shared';
import AppShell from '../components/AppShell';
import UniverseStoriesView from '../components/UniverseStoriesView';

// ── SINGLE mode view ──────────────────────────────────────────────────────────
function SingleModeView({
  accessToken,
  universeId,
}: {
  accessToken: string;
  universeId: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await listStories(universeId, accessToken);
      setStories(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórias.');
    }
  }, [universeId, accessToken]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <AppShell title="Histórias da Gigi">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Histórias da Gigi">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Histórias da Gigi">
      <View style={styles.container}>
        <Text style={styles.heading}>Histórias da Gigi</Text>

        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => router.push('/generate')}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Gerar nova história"
        >
          <Text style={styles.generateButtonText}>✨ Gerar nova história</Text>
        </TouchableOpacity>

        {stories.length === 0 ? (
          <View style={styles.centerFlex}>
            <Text style={styles.emptyText}>Nenhuma historia disponivel ainda.</Text>
          </View>
        ) : (
          <FlatList
            data={stories}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor="#7C3AED"
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/story/${item.id}`)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Ler historia: ${item.title}`}
              >
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDate}>
                  {new Date(item.createdAt).toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </AppShell>
  );
}

// ── MULTI mode: universe list view ────────────────────────────────────────────
function MultiModeView({ accessToken }: { accessToken: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const [universes, setUniverses] = useState<UniverseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUniverse, setSelectedUniverse] = useState<UniverseListItem | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await listMyUniverses(accessToken);
      setUniverses(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar universos.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // When returning from create-universe screen, refresh the list
  useEffect(() => {
    const unsubscribe = router.addListener?.('focus', () => {
      void load();
    });
    return unsubscribe;
  }, [router, load]);

  if (selectedUniverse) {
    return (
      <UniverseStoriesView
        universe={selectedUniverse}
        accessToken={accessToken}
        onBack={() => setSelectedUniverse(null)}
      />
    );
  }

  if (loading) {
    return (
      <AppShell title="Meus Universos">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Meus Universos">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meus Universos">
      <View style={styles.container}>
        <Text style={styles.heading}>Meus Universos</Text>

        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => router.push('/create-universe')}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Criar universo"
        >
          <Text style={styles.generateButtonText}>+ Criar universo</Text>
        </TouchableOpacity>

        {universes.length === 0 ? (
          <View style={styles.centerFlex}>
            <Text style={styles.emptyText}>Voce ainda nao tem universos. Crie um acima!</Text>
          </View>
        ) : (
          <FlatList
            data={universes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor="#7C3AED"
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setSelectedUniverse(item)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Abrir universo: ${item.title}`}
              >
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.cardDate} numberOfLines={2}>{item.description}</Text>
                ) : null}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </AppShell>
  );
}

// ── Root home screen ──────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { accessToken } = useAuth();

  const [appMode, setAppMode] = useState<'SINGLE' | 'MULTI' | null>(null);
  const [singleUniverseId, setSingleUniverseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const config = await getConfig(accessToken);
      setAppMode(config.appMode);
      if (config.appMode === 'SINGLE') {
        setSingleUniverseId(config.singleModeUniverseId ?? null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar configuracao.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoading(true);
    void loadConfig().finally(() => setLoading(false));
  }, [loadConfig]);

  if (loading || !accessToken) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void loadConfig()}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (appMode === 'SINGLE') {
    if (!singleUniverseId) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>Universo nao configurado.</Text>
        </View>
      );
    }
    return <SingleModeView accessToken={accessToken} universeId={singleUniverseId} />;
  }

  if (appMode === 'MULTI') {
    return <MultiModeView accessToken={accessToken} />;
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF5FF',
    paddingTop: 56,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5FF',
    padding: 24,
  },
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E1B4B',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  generateButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
});
