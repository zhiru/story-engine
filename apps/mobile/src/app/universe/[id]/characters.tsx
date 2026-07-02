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
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '../../../lib/api';
import { useAppTheme } from '../../../theme/AppThemeContext';
import type { Character, CreateCharacterInput, UpdateCharacterInput } from '@storygen/shared';
import AppShell from '../../../components/AppShell';

type Classification = 'PRINCIPAL' | 'SECUNDARIO' | 'ANTAGONISTA' | 'MASCOTE';

const CLASSIFICATIONS: Classification[] = ['PRINCIPAL', 'SECUNDARIO', 'ANTAGONISTA', 'MASCOTE'];

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  PRINCIPAL: 'Principal',
  SECUNDARIO: 'Secundário',
  ANTAGONISTA: 'Antagonista',
  MASCOTE: 'Mascote',
};

const AGE_GROUPS = [
  { value: '', label: 'Qualquer' },
  { value: '0_3', label: '0–3 anos' },
  { value: '4_6', label: '4–6 anos' },
  { value: '7_9', label: '7–9 anos' },
  { value: '10_12', label: '10–12 anos' },
];

function classificationColor(c: Classification, primary: string): string {
  switch (c) {
    case 'PRINCIPAL': return primary;
    case 'SECUNDARIO': return '#2563EB';
    case 'ANTAGONISTA': return '#DC2626';
    case 'MASCOTE': return '#D97706';
  }
}

type FormState = {
  name: string;
  classification: Classification;
  ageGroup: string;
  traits: string;
};

const emptyForm: FormState = {
  name: '',
  classification: 'PRINCIPAL',
  ageGroup: '',
  traits: '',
};

function CharacterForm({
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

  const chipStyle = (active: boolean) => [
    formStyles.chip,
    { borderColor: theme.primarySoft },
    active && { backgroundColor: theme.primary, borderColor: theme.primary },
  ];
  const chipTextStyle = (active: boolean) => [
    formStyles.chipText,
    { color: active ? '#ffffff' : theme.primary },
  ];

  return (
    <View style={formStyles.container}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Nome *</Text>
        <TextInput
          style={[
            formStyles.input,
            { backgroundColor: theme.bg, borderColor: theme.primarySoft },
          ]}
          value={form.name}
          onChangeText={(v) => set('name', v)}
          placeholder="Nome do personagem"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Nome do personagem"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Classificação</Text>
        <View style={formStyles.chipRow}>
          {CLASSIFICATIONS.map((c) => (
            <TouchableOpacity
              key={c}
              style={chipStyle(form.classification === c)}
              onPress={() => set('classification', c)}
              accessibilityRole="button"
              accessibilityState={{ selected: form.classification === c }}
              accessibilityLabel={`Classificação: ${CLASSIFICATION_LABELS[c]}`}
            >
              <Text style={chipTextStyle(form.classification === c)}>
                {CLASSIFICATION_LABELS[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Faixa etária</Text>
        <View style={formStyles.chipRow}>
          {AGE_GROUPS.map((ag) => (
            <TouchableOpacity
              key={ag.value}
              style={chipStyle(form.ageGroup === ag.value)}
              onPress={() => set('ageGroup', ag.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: form.ageGroup === ag.value }}
              accessibilityLabel={`Faixa etária: ${ag.label}`}
            >
              <Text style={chipTextStyle(form.ageGroup === ag.value)}>{ag.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Traços (separados por vírgula)</Text>
        <TextInput
          style={[
            formStyles.input,
            { backgroundColor: theme.bg, borderColor: theme.primarySoft },
          ]}
          value={form.traits}
          onChangeText={(v) => set('traits', v)}
          placeholder="corajoso, curioso, amigável..."
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Traços do personagem"
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
          accessibilityLabel="Salvar personagem"
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
 * Personagens de um universo (RF-11) — dono OU admin/mod (o servidor também
 * valida). Mesma UI de CRUD do back-office, parametrizada pelo universo da rota.
 */
export default function UniverseCharactersScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, userId, role } = useAuth();
  const theme = useAppTheme();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
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
        const list = await listCharacters(id, accessToken);
        setCharacters(list);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar personagens.');
    }
  }, [accessToken, id, userId, isPrivileged]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave(form: FormState) {
    if (!id || !accessToken) return;
    if (!form.name.trim()) {
      setFormError('O nome é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const traits = form.traits
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (editingCharacter) {
        const input: UpdateCharacterInput = {
          name: form.name.trim(),
          classification: form.classification,
          ageGroup: form.ageGroup || undefined,
          traits,
        };
        await updateCharacter(id, editingCharacter.id, input, accessToken);
      } else {
        const input: CreateCharacterInput = {
          name: form.name.trim(),
          classification: form.classification,
          ageGroup: form.ageGroup || undefined,
          traits,
        };
        await createCharacter(id, input, accessToken);
      }
      setShowForm(false);
      setEditingCharacter(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar personagem.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(char: Character) {
    setEditingCharacter(char);
    setFormError(null);
    setShowForm(true);
  }

  function handleNew() {
    setEditingCharacter(null);
    setFormError(null);
    setShowForm(true);
  }

  async function handleDelete(char: Character) {
    if (!id || !accessToken) return;
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Excluir "${char.name}"?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Excluir personagem', `Excluir "${char.name}"?`, [
              { text: 'Cancelar', onPress: () => resolve(false) },
              { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!confirmed) return;
    try {
      await deleteCharacter(id, char.id, accessToken);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir personagem.');
    }
  }

  if (loading || (allowed === null && !error)) {
    return (
      <AppShell title="Personagens">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Personagens">
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
      <AppShell title="Personagens">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas o dono do universo (ou a moderação) pode gerenciar personagens.
          </Text>
        </View>
      </AppShell>
    );
  }

  const formInitial: FormState = editingCharacter
    ? {
        name: editingCharacter.name,
        classification: editingCharacter.classification as Classification,
        ageGroup: editingCharacter.ageGroup ?? '',
        traits: editingCharacter.traits.join(', '),
      }
    : emptyForm;

  return (
    <AppShell title="Personagens">
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
          <Text style={styles.pageTitle} accessibilityRole="header">Personagens</Text>
          {!showForm && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={handleNew}
              accessibilityRole="button"
              accessibilityLabel="Novo personagem"
            >
              <Text style={styles.addButtonText}>+ Novo</Text>
            </TouchableOpacity>
          )}
        </View>

        {showForm && (
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>
              {editingCharacter ? 'Editar personagem' : 'Novo personagem'}
            </Text>
            {formError ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}
            <CharacterForm
              initial={formInitial}
              onSave={(f) => void handleSave(f)}
              onCancel={() => {
                setShowForm(false);
                setEditingCharacter(null);
              }}
              saving={saving}
            />
          </View>
        )}

        {characters.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum personagem cadastrado.</Text>
          </View>
        ) : (
          <FlatList
            data={characters}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          classificationColor(
                            item.classification as Classification,
                            theme.primary,
                          ) + '22',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: classificationColor(
                            item.classification as Classification,
                            theme.primary,
                          ),
                        },
                      ]}
                    >
                      {CLASSIFICATION_LABELS[item.classification as Classification]}
                    </Text>
                  </View>
                </View>
                {item.ageGroup ? (
                  <Text style={styles.cardMeta}>
                    Faixa etária: {AGE_GROUPS.find((ag) => ag.value === item.ageGroup)?.label ?? item.ageGroup}
                  </Text>
                ) : null}
                {item.traits.length > 0 ? (
                  <Text style={styles.cardMeta}>Traços: {item.traits.join(', ')}</Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: theme.primarySoft }]}
                    onPress={() => handleEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar personagem ${item.name}`}
                  >
                    <Text style={[styles.editButtonText, { color: theme.primary }]}>
                      Editar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => void handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir personagem ${item.name}`}
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
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
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
