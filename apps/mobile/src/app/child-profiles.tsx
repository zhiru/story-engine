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
import { useAuth } from '../auth/AuthContext';
import {
  listChildProfiles,
  createChildProfile,
  updateChildProfile,
  deleteChildProfile,
  type ChildProfile,
} from '../lib/api';
import AppShell from '../components/AppShell';

type AgeBand = '0_3' | '4_6' | '7_9' | '10_12';

const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: '0_3', label: '0–3 anos' },
  { value: '4_6', label: '4–6 anos' },
  { value: '7_9', label: '7–9 anos' },
  { value: '10_12', label: '10–12 anos' },
];

function ageBandLabel(value: string): string {
  return AGE_BANDS.find((b) => b.value === value)?.label ?? value;
}

type FormState = {
  nickname: string;
  ageBand: AgeBand;
  preferences: string;
};

const emptyForm: FormState = {
  nickname: '',
  ageBand: '4_6',
  preferences: '',
};

function profilePreferencesText(profile: ChildProfile): string {
  const notes = profile.preferences?.notas;
  return typeof notes === 'string' ? notes : '';
}

function ProfileForm({
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

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <View style={formStyles.container}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Apelido *</Text>
        <TextInput
          style={formStyles.input}
          value={form.nickname}
          onChangeText={(v) => set('nickname', v)}
          placeholder="Como a criança gosta de ser chamada"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Apelido da criança"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Faixa etária *</Text>
        <View style={formStyles.chipRow}>
          {AGE_BANDS.map((band) => (
            <TouchableOpacity
              key={band.value}
              style={[formStyles.chip, form.ageBand === band.value && formStyles.chipActive]}
              onPress={() => set('ageBand', band.value)}
              accessibilityRole="button"
              accessibilityLabel={`Faixa etária ${band.label}`}
            >
              <Text style={[formStyles.chipText, form.ageBand === band.value && formStyles.chipTextActive]}>
                {band.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Preferências (opcional)</Text>
        <TextInput
          style={formStyles.input}
          value={form.preferences}
          onChangeText={(v) => set('preferences', v)}
          placeholder="ex.: dinossauros, futebol, princesas..."
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Preferências da criança"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
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
          style={[formStyles.saveBtn, saving && formStyles.saveBtnDisabled]}
          onPress={() => onSave(form)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar perfil"
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

export default function ChildProfilesScreen() {
  const { accessToken } = useAuth();

  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ChildProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const list = await listChildProfiles(accessToken);
      setProfiles(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar perfis.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave(form: FormState) {
    if (!accessToken) return;
    if (!form.nickname.trim()) {
      setFormError('O apelido é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const preferences = form.preferences.trim()
        ? { notas: form.preferences.trim() }
        : {};

      if (editingProfile) {
        await updateChildProfile(
          editingProfile.id,
          {
            nickname: form.nickname.trim(),
            age_band: form.ageBand,
            preferences,
          },
          accessToken,
        );
      } else {
        await createChildProfile(
          {
            nickname: form.nickname.trim(),
            age_band: form.ageBand,
            ...(form.preferences.trim() ? { preferences } : {}),
          },
          accessToken,
        );
      }
      setShowForm(false);
      setEditingProfile(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(profile: ChildProfile) {
    setEditingProfile(profile);
    setFormError(null);
    setShowForm(true);
  }

  function handleNew() {
    setEditingProfile(null);
    setFormError(null);
    setShowForm(true);
  }

  async function handleDelete(profile: ChildProfile) {
    if (!accessToken) return;
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Excluir o perfil "${profile.nickname}"?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Excluir perfil', `Excluir o perfil "${profile.nickname}"?`, [
              { text: 'Cancelar', onPress: () => resolve(false) },
              { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!confirmed) return;
    try {
      await deleteChildProfile(profile.id, accessToken);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir perfil.');
    }
  }

  if (loading) {
    return (
      <AppShell title="Perfis infantis">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Perfis infantis">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => void load()}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  const formInitial: FormState = editingProfile
    ? {
        nickname: editingProfile.nickname,
        ageBand: editingProfile.ageBand,
        preferences: profilePreferencesText(editingProfile),
      }
    : emptyForm;

  return (
    <AppShell title="Perfis infantis">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Perfis infantis</Text>
          {!showForm && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleNew}
              accessibilityRole="button"
              accessibilityLabel="Novo perfil infantil"
            >
              <Text style={styles.addButtonText}>+ Novo</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.pageSubtitle}>
          Cadastre as crianças para personalizar as histórias por faixa etária.
        </Text>

        {showForm && (
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>
              {editingProfile ? 'Editar perfil' : 'Novo perfil'}
            </Text>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <ProfileForm
              initial={formInitial}
              onSave={(f) => void handleSave(f)}
              onCancel={() => {
                setShowForm(false);
                setEditingProfile(null);
              }}
              saving={saving}
            />
          </View>
        )}

        {profiles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum perfil cadastrado ainda.</Text>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{item.nickname}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{ageBandLabel(item.ageBand)}</Text>
                  </View>
                </View>
                {profilePreferencesText(item) ? (
                  <Text style={styles.cardMeta}>
                    Preferências: {profilePreferencesText(item)}
                  </Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar perfil ${item.nickname}`}
                  >
                    <Text style={styles.editButtonText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => void handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir perfil ${item.nickname}`}
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
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
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
    marginBottom: 6,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  addButton: {
    backgroundColor: '#7C3AED',
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
    backgroundColor: '#EDE9FE',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
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
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    color: '#7C3AED',
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
});
