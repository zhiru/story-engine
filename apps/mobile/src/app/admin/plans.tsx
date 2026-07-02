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
  listAdminPlans,
  createAdminPlan,
  updateAdminPlan,
  deleteAdminPlan,
  type AdminPlan,
} from '../../lib/api';
import type { CreatePlanInput, UpdatePlanInput } from '@storygen/shared';
import AppShell from '../../components/AppShell';

function formatPriceBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function parsePriceToCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseNonNegativeInt(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
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

type FormState = {
  name: string;
  maxUniverses: string;
  maxStoriesPerMonth: string;
  price: string;
  revenuecatEntitlement: string;
};

const emptyForm: FormState = {
  name: '',
  maxUniverses: '',
  maxStoriesPerMonth: '',
  price: '',
  revenuecatEntitlement: '',
};

function PlanForm({
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
        <Text style={formStyles.label}>Nome *</Text>
        <TextInput
          style={formStyles.input}
          value={form.name}
          onChangeText={(v) => set('name', v)}
          placeholder="Nome do plano"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Nome do plano"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.rowFields}>
        <View style={[formStyles.field, formStyles.rowField]}>
          <Text style={formStyles.label}>Máx. universos *</Text>
          <TextInput
            style={formStyles.input}
            value={form.maxUniverses}
            onChangeText={(v) => set('maxUniverses', v)}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Máximo de universos"
            {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
          />
        </View>
        <View style={[formStyles.field, formStyles.rowField]}>
          <Text style={formStyles.label}>Máx. histórias/mês *</Text>
          <TextInput
            style={formStyles.input}
            value={form.maxStoriesPerMonth}
            onChangeText={(v) => set('maxStoriesPerMonth', v)}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Máximo de histórias por mês"
            {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
          />
        </View>
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Preço (R$) *</Text>
        <TextInput
          style={formStyles.input}
          value={form.price}
          onChangeText={(v) => set('price', v)}
          placeholder="0,00"
          keyboardType="decimal-pad"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Preço em reais"
          {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Entitlement RevenueCat (opcional)</Text>
        <TextInput
          style={formStyles.input}
          value={form.revenuecatEntitlement}
          onChangeText={(v) => set('revenuecatEntitlement', v)}
          placeholder="ex.: premium"
          autoCapitalize="none"
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="Entitlement do RevenueCat"
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
          accessibilityLabel="Salvar plano"
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

export default function PlansScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const list = await listAdminPlans(accessToken);
      setPlans(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar planos.');
    }
  }, [accessToken, isAllowed]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave(form: FormState) {
    if (!accessToken) return;
    if (!form.name.trim()) {
      setFormError('O nome é obrigatório.');
      return;
    }
    const maxUniverses = parseNonNegativeInt(form.maxUniverses);
    const maxStoriesPerMonth = parseNonNegativeInt(form.maxStoriesPerMonth);
    const priceCents = parsePriceToCents(form.price);
    if (maxUniverses === null || maxStoriesPerMonth === null) {
      setFormError('Limites devem ser números inteiros maiores ou iguais a zero.');
      return;
    }
    if (priceCents === null) {
      setFormError('Preço inválido. Use o formato 0,00.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const entitlement = form.revenuecatEntitlement.trim();
      if (editingPlan) {
        const input: UpdatePlanInput = {
          name: form.name.trim(),
          maxUniverses,
          maxStoriesPerMonth,
          priceCents,
          revenuecatEntitlement: entitlement || null,
        };
        await updateAdminPlan(editingPlan.id, input, accessToken);
      } else {
        const input: CreatePlanInput = {
          name: form.name.trim(),
          maxUniverses,
          maxStoriesPerMonth,
          priceCents,
          revenuecatEntitlement: entitlement || undefined,
        };
        await createAdminPlan(input, accessToken);
      }
      setShowForm(false);
      setEditingPlan(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar plano.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(plan: AdminPlan) {
    if (!accessToken) return;
    const confirmed = await confirmAsync(
      plan.isActive ? 'Desativar plano' : 'Ativar plano',
      plan.isActive
        ? `Desativar o plano "${plan.name}"? Ele deixará de ser oferecido.`
        : `Ativar o plano "${plan.name}"?`,
    );
    if (!confirmed) return;
    try {
      await updateAdminPlan(plan.id, { isActive: !plan.isActive }, accessToken);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar plano.');
    }
  }

  async function handleDelete(plan: AdminPlan) {
    if (!accessToken) return;
    const confirmed = await confirmAsync(
      'Excluir plano',
      `Excluir o plano "${plan.name}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    try {
      await deleteAdminPlan(plan.id, accessToken);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir plano.');
    }
  }

  if (!isAllowed) {
    return (
      <AppShell title="Planos">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem gerenciar planos.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Planos">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Planos">
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

  const formInitial: FormState = editingPlan
    ? {
        name: editingPlan.name,
        maxUniverses: String(editingPlan.maxUniverses),
        maxStoriesPerMonth: String(editingPlan.maxStoriesPerMonth),
        price: (editingPlan.priceCents / 100).toFixed(2).replace('.', ','),
        revenuecatEntitlement: editingPlan.revenuecatEntitlement ?? '',
      }
    : emptyForm;

  return (
    <AppShell title="Planos">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Planos</Text>
          {!showForm && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                setEditingPlan(null);
                setFormError(null);
                setShowForm(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Novo plano"
            >
              <Text style={styles.addButtonText}>+ Novo</Text>
            </TouchableOpacity>
          )}
        </View>

        {showForm && (
          <View style={styles.formPanel}>
            <Text style={styles.formPanelTitle}>
              {editingPlan ? 'Editar plano' : 'Novo plano'}
            </Text>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <PlanForm
              initial={formInitial}
              onSave={(f) => void handleSave(f)}
              onCancel={() => {
                setShowForm(false);
                setEditingPlan(null);
              }}
              saving={saving}
            />
          </View>
        )}

        {plans.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum plano cadastrado.</Text>
          </View>
        ) : (
          <FlatList
            data={plans}
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
                <Text style={styles.cardPrice}>{formatPriceBRL(item.priceCents)}</Text>
                <Text style={styles.cardMeta}>
                  Limites: {item.maxUniverses} universos · {item.maxStoriesPerMonth} histórias/mês
                </Text>
                {item.revenuecatEntitlement ? (
                  <Text style={styles.cardMeta}>
                    Entitlement RevenueCat: {item.revenuecatEntitlement}
                  </Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setEditingPlan(item);
                      setFormError(null);
                      setShowForm(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar plano ${item.name}`}
                  >
                    <Text style={styles.editButtonText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={() => void handleToggleActive(item)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.isActive
                        ? `Desativar plano ${item.name}`
                        : `Ativar plano ${item.name}`
                    }
                  >
                    <Text style={styles.toggleButtonText}>
                      {item.isActive ? 'Desativar' : 'Ativar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => void handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir plano ${item.name}`}
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
  rowFields: {
    flexDirection: 'row',
    gap: 10,
  },
  rowField: {
    flex: 1,
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
  cardPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#7C3AED',
    marginBottom: 6,
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
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#D97706',
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
