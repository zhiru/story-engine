import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
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
  currentAppSlug,
  listAdminAppSettings,
  updateAdminAppSettings,
  type AdminAppSettings,
} from '../../lib/api';
import type { UpdateAppSettingsInput } from '@storygen/shared';
import AppShell from '../../components/AppShell';

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const THEME_COLOR_FIELDS: { key: string; label: string }[] = [
  { key: 'primary', label: 'Cor primária' },
  { key: 'secondary', label: 'Cor secundária' },
  { key: 'background', label: 'Cor de fundo' },
  { key: 'text', label: 'Cor do texto' },
];

function stringValue(record: Record<string, unknown>, key: string): string {
  const v = record[key];
  return typeof v === 'string' ? v : '';
}

export default function SettingsScreen() {
  const { accessToken, role } = useAuth();
  const isAllowed = role === 'ADMIN';

  const [settings, setSettings] = useState<AdminAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulário
  const [themeColors, setThemeColors] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [newFlagKey, setNewFlagKey] = useState('');
  const [appMode, setAppMode] = useState<'SINGLE' | 'MULTI'>('SINGLE');
  const [singleModeUniverseId, setSingleModeUniverseId] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !isAllowed) return;
    try {
      setError(null);
      const rows = await listAdminAppSettings(accessToken);
      const row = rows.find((r) => r.appSlug === currentAppSlug) ?? null;
      if (!row) {
        setError(`Configurações não encontradas para o app "${currentAppSlug}".`);
        return;
      }
      setSettings(row);
      const theme = row.theme ?? {};
      const colors: Record<string, string> = {};
      for (const f of THEME_COLOR_FIELDS) colors[f.key] = stringValue(theme, f.key);
      setThemeColors(colors);
      setLogoUrl(stringValue(theme, 'logo_url'));
      setFont(stringValue(theme, 'font'));
      const flagEntries: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(row.featureFlags ?? {})) {
        flagEntries[key] = value === true;
      }
      setFlags(flagEntries);
      setAppMode(row.appMode);
      setSingleModeUniverseId(row.singleModeUniverseId ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar configurações.');
    }
  }, [accessToken, isAllowed]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleSave() {
    if (!accessToken || !settings) return;
    setSaveError(null);
    setSaveOk(false);

    for (const f of THEME_COLOR_FIELDS) {
      const value = themeColors[f.key]?.trim() ?? '';
      if (value && !HEX_COLOR_RE.test(value)) {
        setSaveError(`${f.label}: use um valor hexadecimal (ex.: #7C3AED).`);
        return;
      }
    }
    const universeId = singleModeUniverseId.trim();
    if (universeId && !UUID_RE.test(universeId)) {
      setSaveError('O ID do universo (modo SINGLE) deve ser um UUID válido.');
      return;
    }

    // Preserva chaves de tema desconhecidas; campos vazios removem a chave.
    const theme: Record<string, unknown> = { ...(settings.theme ?? {}) };
    for (const f of THEME_COLOR_FIELDS) {
      const value = themeColors[f.key]?.trim() ?? '';
      if (value) theme[f.key] = value;
      else delete theme[f.key];
    }
    if (logoUrl.trim()) theme.logo_url = logoUrl.trim();
    else delete theme.logo_url;
    if (font.trim()) theme.font = font.trim();
    else delete theme.font;

    const featureFlags: Record<string, unknown> = {
      ...(settings.featureFlags ?? {}),
      ...flags,
    };

    setSaving(true);
    try {
      const input: UpdateAppSettingsInput = {
        theme,
        featureFlags,
        appMode,
        singleModeUniverseId: universeId || null,
      };
      const updated = await updateAdminAppSettings(settings.appSlug, input, accessToken);
      setSettings(updated);
      setSaveOk(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  function handleAddFlag() {
    const key = newFlagKey.trim();
    if (!key) return;
    setFlags((f) => ({ ...f, [key]: true }));
    setNewFlagKey('');
  }

  if (!isAllowed) {
    return (
      <AppShell title="Configurações">
        <View style={styles.center}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Acesso restrito</Text>
          <Text style={styles.restrictedText}>
            Apenas administradores podem alterar as configurações do app.
          </Text>
        </View>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Configurações">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (error || !settings) {
    return (
      <AppShell title="Configurações">
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Configurações não encontradas.'}</Text>
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
    <AppShell title="Configurações">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Configurações do app</Text>
        </View>
        <Text style={styles.slugText}>App: {settings.appSlug}</Text>

        {/* ── Tema ── */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Tema</Text>
          {THEME_COLOR_FIELDS.map((f) => {
            const value = themeColors[f.key] ?? '';
            const validColor = HEX_COLOR_RE.test(value.trim());
            return (
              <View key={f.key} style={styles.field}>
                <Text style={styles.label}>{f.label}</Text>
                <View style={styles.colorRow}>
                  <TextInput
                    style={[styles.input, styles.colorInput]}
                    value={value}
                    onChangeText={(v) =>
                      setThemeColors((c) => ({ ...c, [f.key]: v }))
                    }
                    placeholder="#7C3AED"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#9CA3AF"
                    accessibilityLabel={f.label}
                    {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
                  />
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: validColor ? value.trim() : '#FFFFFF' },
                      !validColor && styles.swatchEmpty,
                    ]}
                    accessibilityLabel={`Amostra da cor ${f.label}`}
                  />
                </View>
              </View>
            );
          })}

          <View style={styles.field}>
            <Text style={styles.label}>URL do logo</Text>
            <TextInput
              style={styles.input}
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://exemplo.com/logo.png"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="URL do logo"
              {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Fonte</Text>
            <TextInput
              style={styles.input}
              value={font}
              onChangeText={setFont}
              placeholder="ex.: Nunito"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="Fonte do tema"
              {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
            />
          </View>
        </View>

        {/* ── Feature flags ── */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Feature flags</Text>
          {Object.keys(flags).length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma flag configurada.</Text>
          ) : (
            Object.keys(flags)
              .sort()
              .map((key) => (
                <View key={key} style={styles.flagRow}>
                  <Text style={styles.flagKey}>{key}</Text>
                  <Switch
                    value={flags[key]}
                    onValueChange={(v) => setFlags((f) => ({ ...f, [key]: v }))}
                    trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                    thumbColor={flags[key] ? '#7C3AED' : '#9CA3AF'}
                    accessibilityRole="switch"
                    accessibilityLabel={`Flag ${key}`}
                  />
                </View>
              ))
          )}
          <View style={styles.addFlagRow}>
            <TextInput
              style={[styles.input, styles.addFlagInput]}
              value={newFlagKey}
              onChangeText={setNewFlagKey}
              placeholder="nova_flag"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="Nome da nova flag"
              {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
            />
            <TouchableOpacity
              style={styles.addFlagButton}
              onPress={handleAddFlag}
              accessibilityRole="button"
              accessibilityLabel="Adicionar flag"
            >
              <Text style={styles.addFlagButtonText}>+ Adicionar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Modo do app ── */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Modo do app</Text>
          <View style={styles.chipRow}>
            {(['SINGLE', 'MULTI'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.chip, appMode === mode && styles.chipActive]}
                onPress={() => setAppMode(mode)}
                accessibilityRole="button"
                accessibilityLabel={`Modo ${mode}`}
              >
                <Text style={[styles.chipText, appMode === mode && styles.chipTextActive]}>
                  {mode === 'SINGLE' ? 'SINGLE (um universo)' : 'MULTI (vários universos)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Universo do modo SINGLE (UUID)</Text>
            <TextInput
              style={styles.input}
              value={singleModeUniverseId}
              onChangeText={setSingleModeUniverseId}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="ID do universo do modo SINGLE"
              {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
            />
            <Text style={styles.hint}>Deixe vazio para remover o vínculo.</Text>
          </View>
        </View>

        {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
        {saveOk ? <Text style={styles.successText}>Configurações salvas com sucesso.</Text> : null}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Salvar configurações"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Salvar configurações</Text>
          )}
        </TouchableOpacity>
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
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  slugText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    gap: 12,
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
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
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
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorInput: {
    flex: 1,
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
  },
  swatchEmpty: {
    borderStyle: 'dashed',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  flagKey: {
    fontSize: 14,
    color: '#1E1B4B',
    fontWeight: '600',
  },
  addFlagRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addFlagInput: {
    flex: 1,
  },
  addFlagButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addFlagButtonText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
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
  formError: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 12,
  },
  successText: {
    fontSize: 13,
    color: '#16A34A',
    marginBottom: 12,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#A78BFA',
  },
  saveButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
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
