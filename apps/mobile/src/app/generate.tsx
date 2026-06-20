import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { getConfig, listThemes, generateStory, ApiError } from '../lib/api';
import type { Theme } from '@storygen/shared';
import AppShell from '../components/AppShell';

const MAX_GUIDANCE = 500;

export default function GenerateScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();

  const [universeId, setUniverseId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [guidance, setGuidance] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!accessToken) return;
    try {
      setConfigError(null);
      const config = await getConfig(accessToken);
      const uid = config.singleModeUniverseId ?? null;
      setUniverseId(uid);
      if (uid) {
        const themeList = await listThemes(uid, accessToken);
        setThemes(themeList);
      }
    } catch (e: unknown) {
      setConfigError(e instanceof Error ? e.message : 'Erro ao carregar configuração.');
    }
  }, [accessToken]);

  useEffect(() => {
    setLoadingConfig(true);
    void loadConfig().finally(() => setLoadingConfig(false));
  }, [loadConfig]);

  async function handleGenerate() {
    if (!universeId || !accessToken || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateStory(
        {
          universe_id: universeId,
          user_guidance: guidance.trim() || undefined,
          theme_id: selectedThemeId ?? undefined,
        },
        accessToken,
      );
      router.push(`/story/${result.id}`);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 402) {
          setGenerateError('Você atingiu o limite de histórias do seu plano este mês.');
        } else if (e.status === 422) {
          setGenerateError('Não foi possível gerar a história com essa orientação. Tente modificar o texto.');
        } else if (e.status === 403) {
          setGenerateError('Você precisa de uma assinatura ativa para gerar histórias.');
        } else {
          setGenerateError('Erro ao gerar história. Tente novamente.');
        }
      } else {
        setGenerateError('Erro ao gerar história. Tente novamente.');
      }
    } finally {
      setGenerating(false);
    }
  }

  if (loadingConfig) {
    return (
      <AppShell title="Gerar história">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </AppShell>
    );
  }

  if (configError) {
    return (
      <AppShell title="Gerar história">
        <View style={styles.center}>
          <Text style={styles.errorText}>{configError}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => void loadConfig()}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Gerar história">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Gerar história</Text>
        <Text style={styles.pageSubtitle}>Personalize a próxima aventura da Gigi</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Sobre o que vai ser a história de hoje?</Text>
          <TextInput
            style={styles.textArea}
            placeholder="ex.: aprender a dividir os brinquedos, vencer o medo do escuro..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
            maxLength={MAX_GUIDANCE}
            value={guidance}
            onChangeText={setGuidance}
            textAlignVertical="top"
            accessibilityLabel="Orientação para a história"
          />
          <Text style={styles.counter}>
            {guidance.length}/{MAX_GUIDANCE}
          </Text>
        </View>

        {themes.length > 0 && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Tema (opcional)</Text>
            <View style={styles.themeList}>
              <TouchableOpacity
                style={[styles.themeChip, selectedThemeId === null && styles.themeChipActive]}
                onPress={() => setSelectedThemeId(null)}
              >
                <Text style={[styles.themeChipText, selectedThemeId === null && styles.themeChipTextActive]}>
                  Nenhum
                </Text>
              </TouchableOpacity>
              {themes.map((theme) => (
                <TouchableOpacity
                  key={theme.id}
                  style={[styles.themeChip, selectedThemeId === theme.id && styles.themeChipActive]}
                  onPress={() => setSelectedThemeId(theme.id)}
                >
                  <Text style={[styles.themeChipText, selectedThemeId === theme.id && styles.themeChipTextActive]}>
                    {theme.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {generateError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{generateError}</Text>
          </View>
        ) : null}

        {generating ? (
          <View style={styles.generatingBox}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.generatingText}>Criando a história… isso leva alguns segundos</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, generating && styles.primaryButtonDisabled]}
          onPress={() => void handleGenerate()}
          disabled={generating}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Gerar história"
        >
          <Text style={styles.primaryButtonText}>
            {generating ? 'Gerando...' : '✨ Gerar história'}
          </Text>
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
    padding: 24,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5FF',
    padding: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 28,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1E1B4B',
    minHeight: 120,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  counter: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  themeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    backgroundColor: '#ffffff',
  },
  themeChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  themeChipText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '600',
  },
  themeChipTextActive: {
    color: '#ffffff',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  generatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  generatingText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '600',
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#A78BFA',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 17,
  },
});
