import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import {
  listAdminUsers,
  updateAdminUser,
  getAdminCostSummary,
  type AdminUserRow,
} from '../../lib/api';
import type { CostSummary, UpdateUserInput } from '@storygen/shared';
import AppShell from '../../components/AppShell';

const PAGE_SIZE = 20;

type Role = 'USER' | 'MODERATOR' | 'ADMIN';

const ROLES: Role[] = ['USER', 'MODERATOR', 'ADMIN'];

const ROLE_LABELS: Record<Role, string> = {
  USER: 'Usuário',
  MODERATOR: 'Moderador',
  ADMIN: 'Administrador',
};

function roleColor(role: Role): string {
  switch (role) {
    case 'ADMIN': return '#7C3AED';
    case 'MODERATOR': return '#2563EB';
    case 'USER': return '#6B7280';
  }
}

const SUSPENSION_OPTIONS: { label: string; hours: number }[] = [
  { label: '24h', hours: 24 },
  { label: '7 dias', hours: 24 * 7 },
  { label: '30 dias', hours: 24 * 30 },
];

function isSuspended(user: AdminUserRow): boolean {
  return !!user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${message}`);
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', onPress: () => resolve(false) },
      { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function UsersScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Uso global do mês (a API não expõe uso por usuário — mostramos o resumo
  // agregado disponível em GET /admin/cost).
  const [usage, setUsage] = useState<CostSummary | null>(null);
  const [showUsage, setShowUsage] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const list = await listAdminUsers(
        { q: appliedQuery || undefined, limit: PAGE_SIZE, offset },
        accessToken,
      );
      setUsers(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar usuários.');
    }
  }, [accessToken, isAllowed, appliedQuery, offset]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!accessToken || !isAllowed) return;
    getAdminCostSummary(accessToken)
      .then(setUsage)
      .catch(() => {
        // painel de uso é informativo — tolera falha silenciosa
      });
  }, [accessToken, isAllowed]);

  async function applyUpdate(user: AdminUserRow, input: UpdateUserInput) {
    if (!accessToken) return;
    setUpdatingId(user.id);
    setActionError(null);
    try {
      await updateAdminUser(user.id, input, accessToken);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Erro ao atualizar usuário.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleChangeRole(user: AdminUserRow, newRole: Role) {
    if (newRole === user.role) return;
    const confirmed = await confirmAsync(
      'Alterar papel',
      `Alterar o papel de ${user.email} para ${ROLE_LABELS[newRole]}?`,
    );
    if (!confirmed) return;
    await applyUpdate(user, { role: newRole });
  }

  async function handleSuspend(user: AdminUserRow, hours: number, label: string) {
    const confirmed = await confirmAsync(
      'Suspender usuário',
      `Suspender ${user.email} por ${label}?`,
    );
    if (!confirmed) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await applyUpdate(user, { suspendedUntil: until });
  }

  async function handleUnsuspend(user: AdminUserRow) {
    const confirmed = await confirmAsync(
      'Remover suspensão',
      `Remover a suspensão de ${user.email}?`,
    );
    if (!confirmed) return;
    await applyUpdate(user, { suspendedUntil: null });
  }

  if (!isAllowed) {
    return (
      <AppShell title="Usuários">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem gerenciar usuários.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Usuários">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Usuários">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => void load()}
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
    <AppShell title="Usuários">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Usuários</Text>
        </View>

        {usage ? (
          <View style={styles.usagePanel}>
            <TouchableOpacity
              onPress={() => setShowUsage((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel="Mostrar ou ocultar uso do mês"
            >
              <Text style={styles.usageTitle}>
                {showUsage ? '▾' : '▸'} Uso do mês ({usage.period})
              </Text>
            </TouchableOpacity>
            {showUsage && (
              <View style={styles.usageBody}>
                <Text style={styles.usageMeta}>
                  Histórias geradas: {usage.totalStoriesGenerated} · Registros de uso: {usage.usageRecordsTotal}
                </Text>
                {usage.byProvider.map((p) => (
                  <Text key={p.provider} style={styles.usageMeta}>
                    {p.provider}: {p.count} gerações · {p.inputTokens} tokens de entrada · {p.outputTokens} tokens de saída
                  </Text>
                ))}
                <Text style={styles.usageNote}>
                  A API não expõe uso por usuário — este é o resumo agregado do app.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por e-mail..."
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Buscar usuários por e-mail"
            {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => {
              setOffset(0);
              setAppliedQuery(query.trim());
            }}
            accessibilityRole="button"
            accessibilityLabel="Buscar"
          >
            <Text style={styles.searchButtonText}>Buscar</Text>
          </TouchableOpacity>
        </View>

        {actionError ? <Text style={styles.formError}>{actionError}</Text> : null}

        {users.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {appliedQuery
                ? 'Nenhum usuário encontrado para esta busca.'
                : 'Nenhum usuário cadastrado.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const suspended = isSuspended(item);
              const expanded = expandedId === item.id;
              const updating = updatingId === item.id;
              return (
                <View style={styles.card}>
                  <TouchableOpacity
                    onPress={() => setExpandedId(expanded ? null : item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Detalhes de ${item.email}`}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardName}>{item.email}</Text>
                      <View
                        style={[styles.badge, { backgroundColor: roleColor(item.role) + '22' }]}
                      >
                        <Text style={[styles.badgeText, { color: roleColor(item.role) }]}>
                          {ROLE_LABELS[item.role]}
                        </Text>
                      </View>
                      {suspended && (
                        <View style={[styles.badge, { backgroundColor: '#DC262622' }]}>
                          <Text style={[styles.badgeText, { color: '#DC2626' }]}>Suspenso</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardMeta}>{item.name}</Text>
                    {suspended && item.suspendedUntil ? (
                      <Text style={styles.cardMeta}>
                        Suspenso até {formatDateTime(item.suspendedUntil)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>

                  {expanded && (
                    <View style={styles.expandPanel}>
                      {updating ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                      ) : (
                        <>
                          <Text style={styles.expandLabel}>Papel</Text>
                          <View style={styles.chipRow}>
                            {ROLES.map((r) => (
                              <TouchableOpacity
                                key={r}
                                style={[styles.chip, item.role === r && styles.chipActive]}
                                onPress={() => void handleChangeRole(item, r)}
                                accessibilityRole="button"
                                accessibilityLabel={`Definir papel ${ROLE_LABELS[r]}`}
                              >
                                <Text
                                  style={[styles.chipText, item.role === r && styles.chipTextActive]}
                                >
                                  {ROLE_LABELS[r]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <Text style={styles.expandLabel}>Suspensão</Text>
                          <View style={styles.chipRow}>
                            {SUSPENSION_OPTIONS.map((opt) => (
                              <TouchableOpacity
                                key={opt.label}
                                style={styles.suspendChip}
                                onPress={() => void handleSuspend(item, opt.hours, opt.label)}
                                accessibilityRole="button"
                                accessibilityLabel={`Suspender por ${opt.label}`}
                              >
                                <Text style={styles.suspendChipText}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                            {suspended && (
                              <TouchableOpacity
                                style={styles.unsuspendChip}
                                onPress={() => void handleUnsuspend(item)}
                                accessibilityRole="button"
                                accessibilityLabel="Remover suspensão"
                              >
                                <Text style={styles.unsuspendChipText}>Remover suspensão</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, offset === 0 && styles.pageButtonDisabled]}
            onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            accessibilityRole="button"
            accessibilityLabel="Página anterior"
          >
            <Text style={styles.pageButtonText}>← Anterior</Text>
          </TouchableOpacity>
          <Text style={styles.pageInfo}>
            {offset + 1}–{offset + users.length}
          </Text>
          <TouchableOpacity
            style={[styles.pageButton, !hasMore && styles.pageButtonDisabled]}
            onPress={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasMore}
            accessibilityRole="button"
            accessibilityLabel="Próxima página"
          >
            <Text style={styles.pageButtonText}>Próxima →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#FAF5FF',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5FF',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  usagePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  usageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
  },
  usageBody: {
    marginTop: 8,
    gap: 2,
  },
  usageMeta: {
    fontSize: 13,
    color: '#6B7280',
  },
  usageNote: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    fontStyle: 'italic',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E1B4B',
  },
  searchButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  formError: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  expandPanel: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDE9FE',
    paddingTop: 12,
    gap: 8,
  },
  expandLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  suspendChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  suspendChipText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  unsuspendChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  unsuspendChipText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  pageButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
  },
  pageInfo: {
    fontSize: 13,
    color: '#6B7280',
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  restrictedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  restrictedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 8,
  },
  restrictedText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 300,
  },
});
