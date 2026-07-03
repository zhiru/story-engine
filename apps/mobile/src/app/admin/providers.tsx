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
import {
  listAdminAiProviders,
  updateAdminAiProvider,
  type AdminAiProvider,
} from '../../lib/api';
import type { UpdateAiProviderInput } from '@storygen/shared';
import AppShell from '../../components/AppShell';

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

type FormState = {
  model: string;
  params: string;
  fallbackOrder: string;
  isActive: boolean;
};

function ProviderForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  let paramsError: string | null = null;
  if (form.params.trim()) {
    try {
      const parsed: unknown = JSON.parse(form.params);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        paramsError = 'Os parâmetros devem ser um objeto JSON (ex.: {"temperature": 0.7}).';
      }
    } catch {
      paramsError = 'JSON inválido.';
    }
  }

  return (
    <View style={formStyles.container}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Modelo *</Text>
        <TextInput
          style={formStyles.input}
          value={form.model}
          onChangeText={(v) => set('model', v)}
          placeholder="ex.: gpt-4o-mini"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Modelo"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Parâmetros (JSON)</Text>
        <TextInput
          style={[formStyles.input, formStyles.jsonInput, paramsError ? formStyles.inputError : null]}
          value={form.params}
          onChangeText={(v) => set('params', v)}
          placeholder='{"temperature": 0.7}'
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Parâmetros em JSON"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
        {paramsError ? <Text style={formStyles.fieldError}>{paramsError}</Text> : null}
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Ordem de fallback</Text>
        <TextInput
          style={formStyles.input}
          value={form.fallbackOrder}
          onChangeText={(v) => set('fallbackOrder', v)}
          placeholder="0"
          keyboardType="numeric"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Ordem de fallback"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Status</Text>
        <View style={formStyles.chipRow}>
          <TouchableOpacity
            style={[formStyles.chip, form.isActive && formStyles.chipActive]}
            onPress={() => set('isActive', true)}
            accessibilityRole="button"
            accessibilityLabel="Ativar provedor"
          >
            <Text style={[formStyles.chipText, form.isActive && formStyles.chipTextActive]}>
              Ativo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.chip, !form.isActive && formStyles.chipActive]}
            onPress={() => set('isActive', false)}
            accessibilityRole="button"
            accessibilityLabel="Desativar provedor"
          >
            <Text style={[formStyles.chipText, !form.isActive && formStyles.chipTextActive]}>
              Inativo
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={formStyles.actions}>
        <TouchableOpacity
          style={formStyles.cancelBtn}
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
        >
          <Text style={formStyles.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            formStyles.saveBtn,
            (saving || !!paramsError) && formStyles.saveBtnDisabled,
          ]}
          onPress={() => onSave(form)}
          disabled={saving || !!paramsError}
          accessibilityRole="button"
          accessibilityLabel="Salvar provedor"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={formStyles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ProvidersScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [providers, setProviders] = useState<AdminAiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingProvider, setEditingProvider] = useState<AdminAiProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const list = await listAdminAiProviders(accessToken);
      setProviders(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar provedores.');
    }
  }, [accessToken, isAllowed]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave(form: FormState) {
    if (!accessToken || !editingProvider) return;
    if (!form.model.trim()) {
      setFormError('O modelo é obrigatório.');
      return;
    }
    const fallbackOrder = Number(form.fallbackOrder.trim() || '0');
    if (!Number.isInteger(fallbackOrder) || fallbackOrder < 0) {
      setFormError('A ordem de fallback deve ser um inteiro maior ou igual a zero.');
      return;
    }
    let params: Record<string, unknown> | undefined;
    if (form.params.trim()) {
      try {
        const parsed: unknown = JSON.parse(form.params);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setFormError('Os parâmetros devem ser um objeto JSON.');
          return;
        }
        params = parsed as Record<string, unknown>;
      } catch {
        setFormError('Parâmetros: JSON inválido.');
        return;
      }
    } else {
      params = {};
    }
    setSaving(true);
    setFormError(null);
    try {
      const input: UpdateAiProviderInput = {
        model: form.model.trim(),
        params,
        fallbackOrder,
        isActive: form.isActive,
      };
      await updateAdminAiProvider(editingProvider.id, input, accessToken);
      setEditingProvider(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar provedor.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAllowed) {
    return (
      <AppShell title="Provedores de IA">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem gerenciar provedores de IA.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Provedores de IA">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Provedores de IA">
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

  const formInitial: FormState | null = editingProvider
    ? {
        model: editingProvider.model,
        params: JSON.stringify(editingProvider.params ?? {}, null, 2),
        fallbackOrder: String(editingProvider.fallbackOrder),
        isActive: editingProvider.isActive,
      }
    : null;

  return (
    <AppShell title="Provedores de IA">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Provedores de IA</Text>
        </View>

        {editingProvider && formInitial && (
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>
              Editar provedor: {editingProvider.provider}
            </Text>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <ProviderForm
              key={editingProvider.id}
              initial={formInitial}
              onSave={(f) => void handleSave(f)}
              onCancel={() => setEditingProvider(null)}
              saving={saving}
            />
          </View>
        )}

        {providers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum provedor cadastrado.</Text>
          </View>
        ) : (
          <FlatList
            data={providers}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{item.provider}</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: item.isActive ? '#16A34A22' : '#9CA3AF22' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: item.isActive ? '#16A34A' : '#6B7280' },
                      ]}
                    >
                      {item.isActive ? 'Ativo' : 'Inativo'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Modelo: {item.model}</Text>
                <Text style={styles.cardMeta}>Ordem de fallback: {item.fallbackOrder}</Text>
                {Object.keys(item.params ?? {}).length > 0 ? (
                  <Text style={styles.paramsPreview}>
                    {JSON.stringify(item.params, null, 2)}
                  </Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setEditingProvider(item);
                      setFormError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar provedor ${item.provider}`}
                  >
                    <Text style={styles.editButtonText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </ScrollView>
    </AppShell>
  );
}

const formStyles = StyleSheet.create({
  container: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  inputError: {
    borderColor: '#DC2626',
  },
  jsonInput: {
    minHeight: 120,
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldError: {
    fontSize: 12,
    color: '#DC2626',
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
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#A78BFA',
  },
  saveBtnText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
});

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
  formPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  formPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 16,
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
    fontSize: 17,
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
  cardMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  paramsPreview: {
    marginTop: 8,
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    padding: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#1E1B4B',
    fontFamily: MONO_FONT,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
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
