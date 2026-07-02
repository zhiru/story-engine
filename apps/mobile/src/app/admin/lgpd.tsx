import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import {
  listAdminAuditLogs,
  eraseUser,
  type AuditLogEntry,
  type EraseUserResult,
} from '../../lib/api';
import AppShell from '../../components/AppShell';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

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

function EventList({
  title,
  emptyLabel,
  events,
}: {
  title: string;
  emptyLabel: string;
  events: AuditLogEntry[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        events.map((event) => {
          const expanded = expandedId === event.id;
          return (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventAction}>{event.action}</Text>
                <Text style={styles.eventDate}>{formatDateTime(event.createdAt)}</Text>
              </View>
              <Text style={styles.eventMeta}>
                Ator: {event.actorId ?? 'Sistema'}
                {event.targetId ? ` · Alvo: ${event.targetId}` : ''}
              </Text>
              <TouchableOpacity
                onPress={() => setExpandedId(expanded ? null : event.id)}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Ocultar escopo' : 'Ver escopo'}
              >
                <Text style={styles.expandLink}>
                  {expanded ? '▾ Ocultar escopo' : '▸ Ver escopo'}
                </Text>
              </TouchableOpacity>
              {expanded && (
                <Text style={styles.metadataPreview}>
                  {JSON.stringify(event.metadata ?? {}, null, 2)}
                </Text>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

export default function LgpdScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [erasures, setErasures] = useState<AuditLogEntry[]>([]);
  const [purges, setPurges] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Anonimização iniciada pelo admin (DELETE /users/:id)
  const [targetUserId, setTargetUserId] = useState('');
  const [deletePrivateStories, setDeletePrivateStories] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [eraseResult, setEraseResult] = useState<EraseUserResult | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const [erasureList, purgeList] = await Promise.all([
        listAdminAuditLogs({ action: 'LGPD_ERASURE', limit: 50 }, accessToken),
        listAdminAuditLogs({ action: 'RETENTION_PURGE', limit: 50 }, accessToken),
      ]);
      setErasures(erasureList);
      setPurges(purgeList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar eventos LGPD.');
    }
  }, [accessToken, isAllowed]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleErase() {
    if (!accessToken) return;
    setEraseError(null);
    setEraseResult(null);
    const userId = targetUserId.trim();
    if (!UUID_RE.test(userId)) {
      setEraseError('Informe o ID (UUID) do usuário a anonimizar.');
      return;
    }
    // Confirmação dupla — a anonimização é irreversível (SDD 11.2).
    const first = await confirmAsync(
      'Anonimizar usuário',
      `Anonimizar o usuário ${userId}?${
        deletePrivateStories ? ' As histórias PRIVADAS dele serão excluídas integralmente.' : ''
      }`,
    );
    if (!first) return;
    const second = await confirmAsync(
      'Confirmação final',
      'Esta ação é IRREVERSÍVEL: os dados pessoais do titular serão anonimizados. Confirmar mesmo assim?',
    );
    if (!second) return;

    setErasing(true);
    try {
      const result = await eraseUser(
        userId,
        { delete_private_stories: deletePrivateStories },
        accessToken,
      );
      setEraseResult(result);
      setTargetUserId('');
      setDeletePrivateStories(false);
      await load();
    } catch (e: unknown) {
      setEraseError(e instanceof Error ? e.message : 'Erro ao anonimizar usuário.');
    } finally {
      setErasing(false);
    }
  }

  if (!isAllowed) {
    return (
      <AppShell title="LGPD">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem acessar o painel LGPD.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="LGPD">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="LGPD">
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
    <AppShell title="LGPD">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Painel LGPD</Text>
        </View>

        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>Como funciona o direito ao esquecimento</Text>
          <Text style={styles.infoText}>
            1. A anonimização (LGPD_ERASURE) remove os dados pessoais do titular:
            nome, e-mail, perfis de crianças, tokens e referências em personagens
            e histórias. Opcionalmente, as histórias privadas são excluídas
            integralmente.
          </Text>
          <Text style={styles.infoText}>
            2. O expurgo de retenção (RETENTION_PURGE) roda periodicamente e
            apaga em definitivo registros com exclusão lógica além do prazo de
            retenção.
          </Text>
          <Text style={styles.infoText}>
            3. Cada operação fica registrada no log de auditoria com o escopo
            (quantidades anonimizadas/expurgadas), exibido abaixo.
          </Text>
        </View>

        <View style={styles.erasePanel}>
          <Text style={styles.erasePanelTitle}>Anonimizar usuário</Text>
          <Text style={styles.eraseHint}>
            Executa o direito ao esquecimento em nome do titular (ação de
            administrador). Ação irreversível — confirmação dupla.
          </Text>
          <TextInput
            style={styles.input}
            value={targetUserId}
            onChangeText={setTargetUserId}
            placeholder="ID (UUID) do usuário"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="ID do usuário a anonimizar"
            {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Excluir histórias privadas do titular</Text>
            <Switch
              value={deletePrivateStories}
              onValueChange={setDeletePrivateStories}
              trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
              thumbColor={deletePrivateStories ? '#DC2626' : '#9CA3AF'}
              accessibilityRole="switch"
              accessibilityLabel="Excluir histórias privadas do titular"
            />
          </View>
          {eraseError ? <Text style={styles.formError}>{eraseError}</Text> : null}
          {eraseResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Anonimização concluída</Text>
              <Text style={styles.resultText}>
                Perfis de crianças: {eraseResult.anonymized.childProfiles} · Tokens:{' '}
                {eraseResult.anonymized.refreshTokens} · Personagens:{' '}
                {eraseResult.anonymized.characters} · Histórias:{' '}
                {eraseResult.anonymized.stories}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.eraseButton, erasing && styles.eraseButtonDisabled]}
            onPress={() => void handleErase()}
            disabled={erasing}
            accessibilityRole="button"
            accessibilityLabel="Anonimizar usuário"
          >
            {erasing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.eraseButtonText}>Anonimizar usuário</Text>
            )}
          </TouchableOpacity>
        </View>

        <EventList
          title="Exclusões LGPD (LGPD_ERASURE)"
          emptyLabel="Nenhuma anonimização registrada."
          events={erasures}
        />

        <EventList
          title="Expurgos de retenção (RETENTION_PURGE)"
          emptyLabel="Nenhum expurgo registrado."
          events={purges}
        />
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
  infoPanel: {
    backgroundColor: '#EDE9FE',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4C1D95',
  },
  infoText: {
    fontSize: 13,
    color: '#4C1D95',
    lineHeight: 19,
  },
  erasePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  erasePanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  eraseHint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E1B4B',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  switchLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    flexShrink: 1,
  },
  formError: {
    fontSize: 13,
    color: '#DC2626',
  },
  resultBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  resultText: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
  },
  eraseButton: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  eraseButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  eraseButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    gap: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  eventCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    padding: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  eventAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
  eventDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  eventMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  expandLink: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 6,
  },
  metadataPreview: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#1E1B4B',
    fontFamily: MONO_FONT,
  },
  emptyText: {
    fontSize: 14,
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
