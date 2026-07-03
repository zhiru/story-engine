import { useEffect, useState, useCallback } from 'react';
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
import { useAuth } from '../auth/AuthContext';
import { getDiscovery, rateUniverse, ApiError, type DiscoverySort } from '../lib/api';
import { useAppTheme } from '../theme/AppThemeContext';
import type { DiscoveryItem } from '@storygen/shared';
import AppShell from '../components/AppShell';

const PAGE_SIZE = 20;

function Stars({
  score,
  onRate,
  disabled,
}: {
  score: number;
  onRate: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <TouchableOpacity
          key={value}
          onPress={() => onRate(value)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Avaliar com ${value} ${value === 1 ? 'estrela' : 'estrelas'}`}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
        >
          <Text style={[styles.star, value <= Math.round(score) && styles.starFilled]}>
            {value <= Math.round(score) ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.starScore}>{score.toFixed(1)}</Text>
    </View>
  );
}

export default function ExploreScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();
  const theme = useAppTheme();

  const [sort, setSort] = useState<DiscoverySort>('recent');
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);

  const loadFirstPage = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const page = await getDiscovery({ sort, limit: PAGE_SIZE }, accessToken);
      setItems(page.items);
      setNextCursor(page.next_cursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar universos.');
    }
  }, [accessToken, sort]);

  useEffect(() => {
    setLoading(true);
    void loadFirstPage().finally(() => setLoading(false));
  }, [loadFirstPage]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function handleLoadMore() {
    if (!accessToken || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getDiscovery(
        { sort, cursor: nextCursor, limit: PAGE_SIZE },
        accessToken,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch {
      // falha ao paginar não derruba o feed já carregado
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRate(universeId: string, score: number) {
    if (!accessToken || ratingBusy) return;
    setRatingBusy(true);
    setRatingMessage(null);
    try {
      const res = await rateUniverse(universeId, score, accessToken);
      setItems((prev) =>
        prev.map((item) =>
          item.id === universeId ? { ...item, rating_score: res.rating_score } : item,
        ),
      );
      setRatingMessage('Avaliação registrada. Obrigado!');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setRatingMessage('Você não pode avaliar seu próprio universo.');
      } else {
        setRatingMessage('Erro ao enviar avaliação. Tente novamente.');
      }
    } finally {
      setRatingBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Descobrir">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Descobrir">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => void loadFirstPage()}
            accessibilityRole="button"
            accessibilityLabel="Tentar novamente"
          >
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Descobrir">
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={styles.heading}>Descobrir universos</Text>
        <Text style={styles.subtitle}>Universos públicos criados pela comunidade</Text>

        <View style={styles.sortRow}>
          <TouchableOpacity
            style={[
              styles.sortChip,
              { borderColor: theme.primarySoft },
              sort === 'recent' && {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
              },
            ]}
            onPress={() => setSort('recent')}
            accessibilityRole="button"
            accessibilityLabel="Ordenar por mais recentes"
          >
            <Text
              style={[
                styles.sortChipText,
                { color: sort === 'recent' ? '#ffffff' : theme.primary },
              ]}
            >
              Recentes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortChip,
              { borderColor: theme.primarySoft },
              sort === 'top' && {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
              },
            ]}
            onPress={() => setSort('top')}
            accessibilityRole="button"
            accessibilityLabel="Ordenar por melhor avaliados"
          >
            <Text
              style={[
                styles.sortChipText,
                { color: sort === 'top' ? '#ffffff' : theme.primary },
              ]}
            >
              Melhor avaliados
            </Text>
          </TouchableOpacity>
        </View>

        {ratingMessage ? (
          <Text style={[styles.ratingMessage, { color: theme.primary }]}>
            {ratingMessage}
          </Text>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.centerFlex}>
            <Text style={styles.emptyText}>Nenhum universo público por aqui ainda.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReached={() => void handleLoadMore()}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={theme.primary}
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color={theme.primary} style={styles.footerLoader} />
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <TouchableOpacity
                  onPress={() => router.push(`/universe/${item.id}`)}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir universo: ${item.title}`}
                >
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.cardOwner}>por {item.owner_name}</Text>
                </TouchableOpacity>
                <Stars
                  score={item.rating_score}
                  disabled={ratingBusy}
                  onRate={(value) => void handleRate(item.id, value)}
                />
              </View>
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
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sortChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
  },
  sortChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ratingMessage: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontWeight: '600',
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
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  cardOwner: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    fontSize: 22,
    color: '#D1D5DB',
  },
  starFilled: {
    color: '#F59E0B',
  },
  starScore: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    marginLeft: 8,
  },
  footerLoader: {
    paddingVertical: 16,
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
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
