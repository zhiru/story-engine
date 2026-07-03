import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  updateUniverse,
  deleteUniverse,
  ApiError,
  type UniverseDetail,
} from '../../../lib/api';
import { useAppTheme } from '../../../theme/AppThemeContext';
import AppShell from '../../../components/AppShell';
import UniverseStoriesView from '../../../components/UniverseStoriesView';

type UniverseVisibility = 'PRIVATE' | 'PUBLIC' | 'PAID';

const VISIBILITY_OPTIONS: { value: UniverseVisibility; label: string }[] = [
  { value: 'PRIVATE', label: 'Privado' },
  { value: 'PUBLIC', label: 'Público' },
  { value: 'PAID', label: 'Pago' },
];

/** Confirmação dupla antes da exclusão (RF-10 — ação destrutiva em cascata). */
async function confirmTwice(title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return (
      window.confirm(`Excluir o universo "${title}"?`) &&
      window.confirm(
        'Tem certeza? Personagens, temas e arcos deste universo também serão excluídos.',
      )
    );
  }
  const first = await new Promise<boolean>((resolve) => {
    Alert.alert('Excluir universo', `Excluir o universo "${title}"?`, [
      { text: 'Cancelar', onPress: () => resolve(false) },
      { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
  if (!first) return false;
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Tem certeza?',
      'Personagens, temas e arcos deste universo também serão excluídos.',
      [
        { text: 'Cancelar', onPress: () => resolve(false) },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
    );
  });
}

/** Formulário inline de edição do universo (RF-10). */
function EditUniverseForm({
  universe,
  accessToken,
  onSaved,
  onCancel,
}: {
  universe: UniverseDetail;
  accessToken: string;
  onSaved: (updated: UniverseDetail) => void;
  onCancel: () => void;
}) {
  const theme = useAppTheme();
  const [title, setTitle] = useState(universe.title);
  const [description, setDescription] = useState(universe.description);
  const [visibility, setVisibility] = useState<UniverseVisibility>(universe.visibility);
  const [location, setLocation] = useState(universe.locationContext ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving) return;
    if (!title.trim()) {
      setError('O título é obrigatório.');
      return;
    }
    if (!description.trim()) {
      setError('A descrição é obrigatória.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUniverse(
        universe.id,
        {
          title: title.trim(),
          description: description.trim(),
          visibility,
          location_context: location.trim() ? location.trim() : null,
        },
        accessToken,
      );
      onSaved(updated);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : 'Erro ao salvar o universo. Tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.editPanel}>
      <Text style={styles.editPanelTitle}>Editar universo</Text>
      {error ? <Text style={styles.manageError}>{error}</Text> : null}

      <Text style={styles.editLabel}>Título *</Text>
      <TextInput
        style={styles.editInput}
        value={title}
        onChangeText={setTitle}
        maxLength={255}
        placeholder="Título do universo"
        placeholderTextColor="#9CA3AF"
        accessibilityLabel="Título do universo"
      />

      <Text style={styles.editLabel}>Descrição *</Text>
      <TextInput
        style={[styles.editInput, styles.editInputMulti]}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        maxLength={2000}
        textAlignVertical="top"
        placeholder="Descrição do universo"
        placeholderTextColor="#9CA3AF"
        accessibilityLabel="Descrição do universo"
      />

      <Text style={styles.editLabel}>Visibilidade</Text>
      <View style={styles.chipRow}>
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = visibility === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                { borderColor: theme.primarySoft },
                active && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => setVisibility(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Visibilidade: ${opt.label}`}
            >
              <Text style={[styles.chipText, { color: active ? '#ffffff' : theme.primary }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.editLabel}>Cidade ou lugar do universo (opcional)</Text>
      <TextInput
        style={styles.editInput}
        value={location}
        onChangeText={setLocation}
        maxLength={500}
        placeholder="Ex: São Paulo, uma vila na praia..."
        placeholderTextColor="#9CA3AF"
        accessibilityLabel="Cidade ou lugar do universo"
      />

      <View style={styles.editActions}>
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: theme.primarySoft }]}
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Cancelar edição"
        >
          <Text style={styles.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: theme.primary },
            saving && styles.disabledBtn,
          ]}
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar universo"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Histórias de um universo aberto pela descoberta (RF-30) + gestão do dono
 * (RF-10..12): editar/excluir universo e gerenciar personagens/temas.
 * Geração só aparece para o dono (ou admin/mod) — a API nega para os demais.
 */
export default function UniverseScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, userId, role } = useAuth();
  const theme = useAppTheme();

  const [universe, setUniverse] = useState<UniverseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken) return;
    setLoading(true);
    getUniverse(id, accessToken)
      .then(setUniverse)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar universo.');
      })
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  async function handleDelete() {
    if (!universe || !accessToken || deleting) return;
    const confirmed = await confirmTwice(universe.title);
    if (!confirmed) return;
    setDeleting(true);
    setManageError(null);
    try {
      await deleteUniverse(universe.id, accessToken);
      router.back();
    } catch (e: unknown) {
      setManageError(
        e instanceof ApiError ? e.message : 'Erro ao excluir o universo. Tente novamente.',
      );
      setDeleting(false);
    }
  }

  if (loading || !accessToken) {
    return (
      <AppShell title="Universo">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </AppShell>
    );
  }

  if (error || !universe) {
    return (
      <AppShell title="Universo">
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Text style={styles.errorText}>{error ?? 'Universo não encontrado.'}</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  const isOwner = universe.userId === userId;
  const isPrivileged = role === 'ADMIN' || role === 'MODERATOR';
  const canManage = isOwner || isPrivileged;

  const headerExtra = canManage ? (
    <View style={styles.manageBox}>
      {manageError ? <Text style={styles.manageError}>{manageError}</Text> : null}
      {editing ? (
        <EditUniverseForm
          universe={universe}
          accessToken={accessToken}
          onSaved={(updated) => {
            setUniverse(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primarySoft }]}
            onPress={() => {
              setManageError(null);
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Editar universo"
          >
            <Text style={[styles.actionBtnText, { color: theme.primary }]}>✏️ Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primarySoft }]}
            onPress={() => router.push(`/universe/${universe.id}/characters`)}
            accessibilityRole="button"
            accessibilityLabel="Gerenciar personagens do universo"
          >
            <Text style={[styles.actionBtnText, { color: theme.primary }]}>
              🧒 Personagens
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primarySoft }]}
            onPress={() => router.push(`/universe/${universe.id}/themes`)}
            accessibilityRole="button"
            accessibilityLabel="Gerenciar temas do universo"
          >
            <Text style={[styles.actionBtnText, { color: theme.primary }]}>🎭 Temas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => void handleDelete()}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Excluir universo"
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={[styles.actionBtnText, styles.deleteBtnText]}>🗑 Excluir</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  ) : null;

  return (
    <UniverseStoriesView
      universe={{
        id: universe.id,
        title: universe.title,
        description: universe.description,
      }}
      accessToken={accessToken}
      onBack={() => router.back()}
      showGenerate={canManage}
      headerExtra={headerExtra}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  manageBox: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  manageError: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: {
    color: '#DC2626',
  },
  editPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  editPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 10,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginTop: 10,
  },
  editInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1E1B4B',
  },
  editInputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
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
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
  },
});
