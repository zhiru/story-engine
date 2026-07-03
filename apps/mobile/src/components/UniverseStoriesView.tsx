import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { listStories } from '../lib/api';
import { useAppTheme } from '../theme/AppThemeContext';
import type { StoryListItem } from '@storygen/shared';
import AppShell from './AppShell';

export type UniverseSummary = {
  id: string;
  title: string;
  description?: string;
};

/**
 * Lista de histórias de um universo (usada na home MULTI e na descoberta).
 * Gerar história navega para /generate?universe=<id> — a tela de geração
 * concentra as opções (tema, arco, perfil infantil, clima) [RF-25].
 * `headerExtra` permite injetar ações de gestão do dono (RF-10..12).
 */
export default function UniverseStoriesView({
  universe,
  accessToken,
  onBack,
  showGenerate = true,
  headerExtra,
}: {
  universe: UniverseSummary;
  accessToken: string;
  onBack: () => void;
  showGenerate?: boolean;
  headerExtra?: React.ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const theme = useAppTheme();
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await listStories(universe.id, accessToken);
      setStories(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórias.');
    }
  }, [universe.id, accessToken]);

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
      <AppShell title={universe.title}>
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title={universe.title}>
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Tentar novamente"
          >
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title={universe.title}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={[styles.backLink, { color: theme.primary }]}>← Voltar</Text>
        </TouchableOpacity>

        <Text style={styles.heading} accessibilityRole="header">{universe.title}</Text>
        {universe.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {universe.description}
          </Text>
        ) : null}

        {headerExtra}

        {showGenerate ? (
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: theme.primary }]}
            onPress={() => router.push(`/generate?universe=${universe.id}`)}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Gerar nova história neste universo"
          >
            <Text style={styles.generateButtonText}>✨ Gerar nova história</Text>
          </TouchableOpacity>
        ) : null}

        {stories.length === 0 ? (
          <View style={styles.centerFlex}>
            <Text style={styles.emptyText}>Nenhuma história neste universo ainda.</Text>
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
                tintColor={theme.primary}
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/story/${item.id}`)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Ler história: ${item.title}`}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  generateButton: {
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
    shadowColor: '#1E1B4B',
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
