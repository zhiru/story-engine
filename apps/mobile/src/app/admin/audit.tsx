import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
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
import { listAdminAuditLogs, type AuditLogEntry } from '../../lib/api';
import AppShell from '../../components/AppShell';

const PAGE_SIZE = 30;

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

// Ações conhecidas gravadas pela API (rotas admin + serviços LGPD/retenção).
const KNOWN_ACTIONS = [
  'USER_UPDATED',
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'PLAN_DELETED',
  'PROMPT_TEMPLATE_CREATED',
  'PROMPT_TEMPLATE_UPDATED',
  'PROMPT_TEMPLATE_ACTIVATED',
  'AI_PROVIDER_UPDATED',
  'REPORT_ACTIONED',
  'APP_SETTINGS_UPDATED',
  'LGPD_ERASURE',
  'RETENTION_PURGE',
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionInput, setActionInput] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const list = await listAdminAuditLogs(
        { action: actionFilter || undefined, limit: PAGE_SIZE, offset },
        accessToken,
      );
      setLogs(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar registros de auditoria.');
    }
  }, [accessToken, isAllowed, actionFilter, offset]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  function applyFilter(action: string) {
    setOffset(0);
    setExpandedId(null);
    setActionInput(action);
    setActionFilter(action);
  }

  if (!isAllowed) {
    return (
      <AppShell title="Auditoria">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem consultar o log de auditoria.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Auditoria">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Auditoria">
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
    <AppShell title="Auditoria">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Log de auditoria</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={actionInput}
            onChangeText={setActionInput}
            placeholder="Filtrar por ação (ex.: USER_UPDATED)"
            autoCapitalize="characters"
            autoCorrect={false}
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Filtrar por ação"
            {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => applyFilter(actionInput.trim())}
            accessibilityRole="button"
            accessibilityLabel="Aplicar filtro"
          >
            <Text style={styles.searchButtonText}>Filtrar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipScrollContent}
        >
          <TouchableOpacity
            style={[styles.chip, actionFilter === '' && styles.chipActive]}
            onPress={() => applyFilter('')}
            accessibilityRole="button"
            accessibilityLabel="Mostrar todas as ações"
          >
            <Text style={[styles.chipText, actionFilter === '' && styles.chipTextActive]}>
              Todas
            </Text>
          </TouchableOpacity>
          {KNOWN_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action}
              style={[styles.chip, actionFilter === action && styles.chipActive]}
              onPress={() => applyFilter(action)}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${action}`}
            >
              <Text style={[styles.chipText, actionFilter === action && styles.chipTextActive]}>
                {action}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {logs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum registro encontrado.</Text>
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const expanded = expandedId === item.id;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardAction}>{item.action}</Text>
                    <Text style={styles.cardDate}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    Ator: {item.actorId ?? 'Sistema'}
                  </Text>
                  {item.targetType ? (
                    <Text style={styles.cardMeta}>
                      Alvo: {item.targetType}
                      {item.targetId ? ` · ${item.targetId}` : ''}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setExpandedId(expanded ? null : item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? 'Ocultar metadados' : 'Ver metadados'}
                  >
                    <Text style={styles.expandLink}>
                      {expanded ? '▾ Ocultar metadados' : '▸ Ver metadados'}
                    </Text>
                  </TouchableOpacity>
                  {expanded && (
                    <Text style={styles.metadataPreview}>
                      {JSON.stringify(item.metadata ?? {}, null, 2)}
                    </Text>
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
            {logs.length > 0 ? `${offset + 1}–${offset + logs.length}` : '—'}
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
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
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
  chipScroll: {
    marginBottom: 16,
  },
  chipScrollContent: {
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
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
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
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  cardAction: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
  },
  cardDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cardMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  expandLink: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 6,
  },
  metadataPreview: {
    marginTop: 8,
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    padding: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#1E1B4B',
    fontFamily: MONO_FONT,
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
