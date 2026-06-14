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
import { getConfig, listStories, generateStory, ApiError } from '../lib/api';
import type { StoryListItem } from '@storygen/shared';

export default function HomeScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();

  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [universeId, setUniverseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const config = await getConfig(accessToken);
      if (!config.singleModeUniverseId) {
        setError('Universo não configurado.');
        return;
      }
      setUniverseId(config.singleModeUniverseId);
      const list = await listStories(config.singleModeUniverseId, accessToken);
      setStories(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórias.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoading(true);
    void loadStories().finally(() => setLoading(false));
  }, [loadStories]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadStories();
    setRefreshing(false);
  }

  async function handleGenerate() {
    if (!accessToken || !universeId || generating) return;
    setGenerating(true);
    setGenerateMessage(null);

    try {
      const result = await generateStory({ universe_id: universeId }, accessToken);
      // Refresh story list then navigate to the new story
      await loadStories();
      router.push(`/story/${result.id}`);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 402) {
          setGenerateMessage('Voce atingiu o limite de historias do seu plano este mes.');
        } else if (e.status === 422) {
          setGenerateMessage('Nao foi possivel gerar a historia. Tente ajustar a orientacao.');
        } else if (e.status === 403) {
          setGenerateMessage('Voce precisa de uma assinatura ativa para gerar historias.');
        } else {
          setGenerateMessage('Erro ao gerar historia. Tente novamente.');
        }
      } else {
        setGenerateMessage('Erro ao gerar historia. Tente novamente.');
      }
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
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
        <TouchableOpacity style={styles.retryButton} onPress={() => void loadStories()}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Historias da Gigi</Text>

      {/* Generate button */}
      <TouchableOpacity
        style={[styles.generateButton, generating && styles.generateButtonDisabled]}
        onPress={() => void handleGenerate()}
        disabled={generating || !universeId}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Gerar nova historia"
      >
        {generating ? (
          <View style={styles.generateButtonInner}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.generateButtonText}>Gerando historia...</Text>
          </View>
        ) : (
          <Text style={styles.generateButtonText}>Gerar nova historia</Text>
        )}
      </TouchableOpacity>

      {generateMessage ? (
        <Text style={styles.generateMessageText}>{generateMessage}</Text>
      ) : null}

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
  generateButtonDisabled: {
    backgroundColor: '#A78BFA',
  },
  generateButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  generateButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  generateMessageText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
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
