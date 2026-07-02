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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../auth/AuthContext';
import {
  getUniverse,
  listThemes,
  createTheme,
  updateTheme,
  deleteTheme,
} from '../../../lib/api';
import { useAppTheme } from '../../../theme/AppThemeContext';
import type { Theme, CreateThemeInput, UpdateThemeInput } from '@storygen/shared';
import AppShell from '../../../components/AppShell';

type FormState = {
  title: string;
  description: string;
};

const emptyForm: FormState = { title: '', description: '' };

function ThemeForm({
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
  const theme = useAppTheme();
  const [form, setForm] = useState<FormState>(initial);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <View style={formStyles.container}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Título *</Text>
        <TextInput
          style={[
            formStyles.input,
            { backgroundColor: theme.bg, borderColor: theme.primarySoft },
          ]}
          value={form.title}
          onChangeText={(v) => set('title', v)}
          placeholder="Título do tema"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Título do tema"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Descrição (opcional)</Text>
        <TextInput
          style={[
            formStyles.input,
            formStyles.textArea,
            { backgroundColor: theme.bg, borderColor: theme.primarySoft },
          ]}
          value={form.description}
          onChangeText={(v) => set('description', v)}
          placeholder="Descreva o tema..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="Descrição do tema"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.actions}>
        <TouchableOpacity
          style={[formStyles.cancelBtn, { borderColor: theme.primarySoft }]}
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
            { backgroundColor: theme.primary },
            saving && formStyles.saveBtnDisabled,
          ]}
          onPress={() => onSave(form)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar tema"
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

/**
 * Temas de um universo (RF-12) — dono OU admin/mod (o servidor também
 * valida). Mesma UI de CRUD do back-office, parametrizada pelo universo da rota.
 */
export default function UniverseThemesScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, userId, role } = useAuth();
  const theme = useAppTheme();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPrivileged = role === 'ADMIN' || role === 'MODERATOR';

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      setError(null);
      const universe = await getUniverse(id, accessToken);
      const canManage = universe.userId === userId || isPrivileged;
      setAllowed(canManage);
      if (canManage) {
        const list = await listThemes(id, accessToken);
        setThemes(list);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar temas.');
    }
  }, [accessToken, id, userId, isPrivileged]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave(form: FormState) {
    if (!id || !accessToken) return;
    if (!form.title.trim()) {
      setFormError('O título é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingTheme) {
        const input: UpdateThemeInput = {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        };
        await updateTheme(id, editingTheme.id, input, accessToken);
      } else {
        const input: CreateThemeInput = {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        };
        await createTheme(id, input, accessToken);
      }
      setShowForm(false);
      setEditingTheme(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar tema.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(t: Theme) {
    setEditingTheme(t);
    setFormError(null);
    setShowForm(true);
  }

  function handleNew() {
    setEditingTheme(null);
    setFormError(null);
    setShowForm(true);
  }

  async function handleDelete(t: Theme) {
    if (!id || !accessToken) return;
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Excluir o tema "${t.title}"?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Excluir tema', `Excluir "${t.title}"?`, [
              { text: 'Cancelar', onPress: () => resolve(false) },
              { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!confirmed) return;
    try {
      await deleteTheme(id, t.id, accessToken);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir tema.');
    }
  }

  if (loading || (allowed === null && !error)) {
    return (
      <AppShell title="Temas">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Temas">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
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

  if (allowed === false) {
    return (
      <AppShell title="Temas">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas o dono do universo (ou a moderação) pode gerenciar temas.
          </Text>
        </View>
      </AppShell>
    );
  }

  const formInitial: FormState = editingTheme
    ? {
        title: editingTheme.title,
        description: editingTheme.description ?? '',
      }
    : emptyForm;

  return (
    <AppShell title="Temas">
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar para o universo"
        >
          <Text style={[styles.backLink, { color: theme.primary }]}>← Voltar</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.pageTitle} accessibilityRole="header">Temas</Text>
          {!showForm && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={handleNew}
              accessibilityRole="button"
              accessibilityLabel="Novo tema"
            >
              <Text style={styles.addButtonText}>+ Novo</Text>
            </TouchableOpacity>
          )}
        </View>

        {showForm && (
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>
              {editingTheme ? 'Editar tema' : 'Novo tema'}
            </Text>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <ThemeForm
              initial={formInitial}
              onSave={(f) => void handleSave(f)}
              onCancel={() => {
                setShowForm(false);
                setEditingTheme(null);
              }}
              saving={saving}
            />
          </View>
        )}

        {themes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum tema cadastrado.</Text>
          </View>
        ) : (
          <FlatList
            data={themes}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardName}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.cardMeta} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: theme.primarySoft }]}
                    onPress={() => handleEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar tema ${item.title}`}
                  >
                    <Text style={[styles.editButtonText, { color: theme.primary }]}>
                      Editar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => void handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir tema ${item.title}`}
                  >
                    <Text style={styles.deleteButtonText}>Excluir</Text>
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
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E1B4B',
  },
  textArea: {
    minHeight: 90,
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
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
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
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backRow: {
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
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
  addButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  formPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#1E1B4B',
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
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
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
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#DC2626',
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
