import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import {
  listAdminReports,
  updateAdminReport,
  type AdminReport,
  type ReportStatus,
} from '../../lib/api';
import AppShell from '../../components/AppShell';

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: ReportStatus | ''; label: string }[] = [
  { value: 'OPEN', label: 'Abertas' },
  { value: 'REVIEWING', label: 'Em análise' },
  { value: 'ACTIONED', label: 'Com ação' },
  { value: 'DISMISSED', label: 'Descartadas' },
  { value: '', label: 'Todas' },
];

const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Aberta',
  REVIEWING: 'Em análise',
  ACTIONED: 'Ação tomada',
  DISMISSED: 'Descartada',
};

function statusColor(status: ReportStatus): string {
  switch (status) {
    case 'OPEN': return '#DC2626';
    case 'REVIEWING': return '#D97706';
    case 'ACTIONED': return '#16A34A';
    case 'DISMISSED': return '#6B7280';
  }
}

const TARGET_LABELS: Record<AdminReport['targetType'], string> = {
  UNIVERSE: 'Universo',
  CHARACTER: 'Personagem',
  STORY: 'História',
};

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

export default function ReportsScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN' || role === 'MODERATOR';

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('OPEN');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const list = await listAdminReports(
        { status: statusFilter || undefined, limit: PAGE_SIZE, offset },
        accessToken,
      );
      setReports(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar denúncias.');
    }
  }, [accessToken, isAllowed, statusFilter, offset]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleUpdateStatus(report: AdminReport, newStatus: ReportStatus) {
    if (!accessToken) return;
    const extra =
      newStatus === 'ACTIONED' && report.targetType === 'STORY'
        ? ' A história denunciada será bloqueada (moderação: rejeitada).'
        : '';
    const confirmed = await confirmAsync(
      'Atualizar denúncia',
      `Marcar esta denúncia como "${STATUS_LABELS[newStatus]}"?${extra}`,
    );
    if (!confirmed) return;
    setUpdatingId(report.id);
    setActionError(null);
    try {
      await updateAdminReport(report.id, { status: newStatus }, accessToken);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Erro ao atualizar denúncia.');
    } finally {
      setUpdatingId(null);
    }
  }

  if (!isAllowed) {
    return (
      <AppShell title="Denúncias">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores e moderadores podem revisar denúncias.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Denúncias">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Denúncias">
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
    <AppShell title="Denúncias">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Fila de moderação</Text>
        </View>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, statusFilter === f.value && styles.chipActive]}
              onPress={() => {
                setOffset(0);
                setStatusFilter(f.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${f.label}`}
            >
              <Text style={[styles.chipText, statusFilter === f.value && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {actionError ? <Text style={styles.formError}>{actionError}</Text> : null}

        {reports.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma denúncia nesta fila. 🎉</Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const updating = updatingId === item.id;
              const isFinal = item.status === 'ACTIONED' || item.status === 'DISMISSED';
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>
                      {TARGET_LABELS[item.targetType]}
                    </Text>
                    <View
                      style={[styles.badge, { backgroundColor: statusColor(item.status) + '22' }]}
                    >
                      <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardReason}>{item.reason}</Text>
                  {item.details ? <Text style={styles.cardDetails}>{item.details}</Text> : null}
                  <Text style={styles.cardMeta}>Alvo: {item.targetId}</Text>
                  <Text style={styles.cardMeta}>Denunciante: {item.reporterId}</Text>
                  <Text style={styles.cardMeta}>Criada em {formatDateTime(item.createdAt)}</Text>
                  {item.resolvedBy ? (
                    <Text style={styles.cardMeta}>Resolvida por: {item.resolvedBy}</Text>
                  ) : null}

                  {updating ? (
                    <View style={styles.cardActions}>
                      <ActivityIndicator size="small" color="#7C3AED" />
                    </View>
                  ) : !isFinal ? (
                    <View style={styles.cardActions}>
                      {item.status !== 'REVIEWING' && (
                        <TouchableOpacity
                          style={styles.reviewButton}
                          onPress={() => void handleUpdateStatus(item, 'REVIEWING')}
                          accessibilityRole="button"
                          accessibilityLabel="Marcar como em análise"
                        >
                          <Text style={styles.reviewButtonText}>Em análise</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void handleUpdateStatus(item, 'ACTIONED')}
                        accessibilityRole="button"
                        accessibilityLabel="Tomar ação"
                      >
                        <Text style={styles.actionButtonText}>Tomar ação</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={() => void handleUpdateStatus(item, 'DISMISSED')}
                        accessibilityRole="button"
                        accessibilityLabel="Descartar denúncia"
                      >
                        <Text style={styles.dismissButtonText}>Descartar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
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
            {reports.length > 0 ? `${offset + 1}–${offset + reports.length}` : '—'}
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
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
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
    flex: 1,
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardReason: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  cardMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  reviewButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
  },
  reviewButtonText: {
    fontSize: 14,
    color: '#D97706',
    fontWeight: '700',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '700',
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '700',
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
