import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import {
  getConfig,
  listThemes,
  listArcs,
  createArc,
  listChildProfiles,
  listMyUniverses,
  generateStory,
  ApiError,
  type StoryArc,
  type ChildProfile,
  type GenerateStoryResult,
} from '../lib/api';
import type { Theme, UniverseListItem } from '@storygen/shared';
import AppShell from '../components/AppShell';

const MAX_GUIDANCE = 500;

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GEO_UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('GEO_DENIED')),
      { timeout: 10000, maximumAge: 60000 },
    );
  });
}

export default function GenerateScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ universe?: string | string[] }>();
  const universeParam = Array.isArray(params.universe)
    ? params.universe[0]
    : params.universe;

  const [universeId, setUniverseId] = useState<string | null>(null);
  const [myUniverses, setMyUniverses] = useState<UniverseListItem[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [arcs, setArcs] = useState<StoryArc[]>([]);
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [guidance, setGuidance] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Novo arco inline (RF-13/RF-25)
  const [showArcForm, setShowArcForm] = useState(false);
  const [newArcTitle, setNewArcTitle] = useState('');
  const [creatingArc, setCreatingArc] = useState(false);
  const [arcError, setArcError] = useState<string | null>(null);

  // Geolocalização (RF-22)
  const [useGeo, setUseGeo] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateStoryResult | null>(null);

  // Resolve o universo: ?universe= (MULTI) > singleModeUniverseId (SINGLE).
  // Em MULTI sem parâmetro, lista os universos do usuário para escolha.
  const loadConfig = useCallback(async () => {
    if (!accessToken) return;
    try {
      setConfigError(null);
      if (universeParam) {
        setUniverseId(universeParam);
        return;
      }
      const config = await getConfig(accessToken);
      if (config.appMode === 'SINGLE') {
        setUniverseId(config.singleModeUniverseId ?? null);
        return;
      }
      // MULTI sem ?universe= — oferecer escolha entre os universos do usuário
      const universes = await listMyUniverses(accessToken);
      setMyUniverses(universes);
      if (universes.length === 1) {
        setUniverseId(universes[0].id);
      }
    } catch (e: unknown) {
      setConfigError(e instanceof Error ? e.message : 'Erro ao carregar configuração.');
    }
  }, [accessToken, universeParam]);

  useEffect(() => {
    setLoadingConfig(true);
    void loadConfig().finally(() => setLoadingConfig(false));
  }, [loadConfig]);

  // Temas e arcos do universo selecionado (falhas individuais são toleradas)
  useEffect(() => {
    if (!universeId || !accessToken) {
      setThemes([]);
      setArcs([]);
      return;
    }
    setSelectedThemeId(null);
    setSelectedArcId(null);
    void listThemes(universeId, accessToken)
      .then(setThemes)
      .catch(() => setThemes([]));
    void listArcs(universeId, accessToken)
      .then((list) => setArcs(list.filter((a) => a.isActive)))
      .catch(() => setArcs([]));
  }, [universeId, accessToken]);

  // Perfis infantis do responsável (RF-03) — independem do universo
  useEffect(() => {
    if (!accessToken) return;
    void listChildProfiles(accessToken)
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [accessToken]);

  async function handleToggleGeo(value: boolean) {
    setGeoError(null);
    if (!value) {
      setUseGeo(false);
      setGeo(null);
      return;
    }
    setUseGeo(true);
    try {
      const position = await getCurrentPosition();
      setGeo(position);
    } catch {
      setUseGeo(false);
      setGeo(null);
      setGeoError(
        'Não foi possível obter sua localização. A história usará o clima padrão.',
      );
    }
  }

  async function handleCreateArc() {
    if (!universeId || !accessToken || creatingArc) return;
    const title = newArcTitle.trim();
    if (!title) {
      setArcError('Dê um título para o arco.');
      return;
    }
    setCreatingArc(true);
    setArcError(null);
    try {
      const arc = await createArc(universeId, { title }, accessToken);
      setArcs((list) => [...list, arc]);
      setSelectedArcId(arc.id);
      setNewArcTitle('');
      setShowArcForm(false);
    } catch (e: unknown) {
      setArcError(e instanceof Error ? e.message : 'Erro ao criar arco.');
    } finally {
      setCreatingArc(false);
    }
  }

  async function handleGenerate() {
    if (!universeId || !accessToken || generating) return;
    setGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const generated = await generateStory(
        {
          universe_id: universeId,
          user_guidance: guidance.trim() || undefined,
          theme_id: selectedThemeId ?? undefined,
          story_arc_id: selectedArcId ?? undefined,
          child_profile_id: selectedProfileId ?? undefined,
          geo: useGeo && geo ? geo : undefined,
        },
        accessToken,
      );
      setResult(generated);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 402) {
          setGenerateError('Você atingiu o limite de histórias do seu plano este mês.');
        } else if (e.status === 422) {
          setGenerateError('Não foi possível gerar a história com essa orientação. Tente modificar o texto.');
        } else if (e.status === 403) {
          setGenerateError('Você precisa de uma assinatura ativa (e acesso ao universo) para gerar histórias.');
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

  if (!universeId && myUniverses.length === 0) {
    return (
      <AppShell title="Gerar história">
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Você ainda não tem universos. Crie um na tela inicial para gerar histórias.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/')}
            accessibilityRole="button"
            accessibilityLabel="Ir para a tela inicial"
          >
            <Text style={styles.primaryButtonText}>Ir para o início</Text>
          </TouchableOpacity>
        </View>
      </AppShell>
    );
  }

  // Painel de sucesso: mostra chip de clima (RF-22) e leva à leitura
  if (result) {
    return (
      <AppShell title="Gerar história">
        <View style={styles.center}>
          <Text style={styles.successTitle}>História criada! 🎉</Text>
          <Text style={styles.successStoryTitle}>{result.title}</Text>
          <View style={styles.weatherChip}>
            <Text style={styles.weatherChipText}>
              🌤 {result.metadata_weather.condition}, {Math.round(result.metadata_weather.temp)}°C
              {' · '}
              {result.metadata_weather.time}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push(`/story/${result.id}`)}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Ler a história gerada"
          >
            <Text style={styles.primaryButtonText}>📖 Ler história</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setResult(null)}
            accessibilityRole="button"
            accessibilityLabel="Gerar outra história"
          >
            <Text style={styles.secondaryButtonText}>Gerar outra</Text>
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
        <Text style={styles.pageSubtitle}>Personalize a próxima aventura</Text>

        {!universeParam && myUniverses.length > 0 && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Universo</Text>
            <View style={styles.themeList}>
              {myUniverses.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.themeChip, universeId === u.id && styles.themeChipActive]}
                  onPress={() => setUniverseId(u.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Universo ${u.title}`}
                >
                  <Text style={[styles.themeChipText, universeId === u.id && styles.themeChipTextActive]}>
                    {u.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

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
                accessibilityRole="button"
                accessibilityLabel="Nenhum tema"
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
                  accessibilityRole="button"
                  accessibilityLabel={`Tema ${theme.title}`}
                >
                  <Text style={[styles.themeChipText, selectedThemeId === theme.id && styles.themeChipTextActive]}>
                    {theme.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {universeId ? (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Continuar arco (opcional)</Text>
            <View style={styles.themeList}>
              <TouchableOpacity
                style={[styles.themeChip, selectedArcId === null && styles.themeChipActive]}
                onPress={() => setSelectedArcId(null)}
                accessibilityRole="button"
                accessibilityLabel="Nenhum arco"
              >
                <Text style={[styles.themeChipText, selectedArcId === null && styles.themeChipTextActive]}>
                  Nenhum
                </Text>
              </TouchableOpacity>
              {arcs.map((arc) => (
                <TouchableOpacity
                  key={arc.id}
                  style={[styles.themeChip, selectedArcId === arc.id && styles.themeChipActive]}
                  onPress={() => setSelectedArcId(arc.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Arco ${arc.title}`}
                >
                  <Text style={[styles.themeChipText, selectedArcId === arc.id && styles.themeChipTextActive]}>
                    {arc.title}
                  </Text>
                </TouchableOpacity>
              ))}
              {!showArcForm && (
                <TouchableOpacity
                  style={styles.newArcChip}
                  onPress={() => setShowArcForm(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Criar novo arco"
                >
                  <Text style={styles.newArcChipText}>+ Novo arco</Text>
                </TouchableOpacity>
              )}
            </View>

            {showArcForm && (
              <View style={styles.arcForm}>
                <TextInput
                  style={styles.arcInput}
                  placeholder="Título do novo arco"
                  placeholderTextColor="#9CA3AF"
                  value={newArcTitle}
                  onChangeText={setNewArcTitle}
                  maxLength={255}
                  accessibilityLabel="Título do novo arco"
                  {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
                />
                <TouchableOpacity
                  style={[styles.arcCreateBtn, creatingArc && styles.primaryButtonDisabled]}
                  onPress={() => void handleCreateArc()}
                  disabled={creatingArc}
                  accessibilityRole="button"
                  accessibilityLabel="Criar arco"
                >
                  {creatingArc ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.arcCreateBtnText}>Criar</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.arcCancelBtn}
                  onPress={() => {
                    setShowArcForm(false);
                    setNewArcTitle('');
                    setArcError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar novo arco"
                >
                  <Text style={styles.arcCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
            {arcError ? <Text style={styles.inlineError}>{arcError}</Text> : null}
          </View>
        ) : null}

        {profiles.length > 0 && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Para quem é a história? (opcional)</Text>
            <View style={styles.themeList}>
              <TouchableOpacity
                style={[styles.themeChip, selectedProfileId === null && styles.themeChipActive]}
                onPress={() => setSelectedProfileId(null)}
                accessibilityRole="button"
                accessibilityLabel="Nenhum perfil"
              >
                <Text style={[styles.themeChipText, selectedProfileId === null && styles.themeChipTextActive]}>
                  Ninguém específico
                </Text>
              </TouchableOpacity>
              {profiles.map((profile) => (
                <TouchableOpacity
                  key={profile.id}
                  style={[styles.themeChip, selectedProfileId === profile.id && styles.themeChipActive]}
                  onPress={() => setSelectedProfileId(profile.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Perfil ${profile.nickname}`}
                >
                  <Text style={[styles.themeChipText, selectedProfileId === profile.id && styles.themeChipTextActive]}>
                    {profile.nickname}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.formGroup}>
          <View style={styles.geoRow}>
            <Text style={styles.label}>Usar minha localização para o clima</Text>
            <Switch
              value={useGeo}
              onValueChange={(v) => void handleToggleGeo(v)}
              trackColor={{ false: '#DDD6FE', true: '#A78BFA' }}
              thumbColor={useGeo ? '#7C3AED' : '#ffffff'}
              accessibilityLabel="Usar minha localização para o clima"
            />
          </View>
          {useGeo && geo ? (
            <Text style={styles.geoHint}>📍 Localização obtida — o clima da sua região entra na história.</Text>
          ) : null}
          {geoError ? <Text style={styles.inlineError}>{geoError}</Text> : null}
        </View>

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
          style={[styles.primaryButton, (generating || !universeId) && styles.primaryButtonDisabled]}
          onPress={() => void handleGenerate()}
          disabled={generating || !universeId}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Gerar história"
        >
          <Text style={styles.primaryButtonText}>
            {generating ? 'Gerando...' : '✨ Gerar história'}
          </Text>
        </TouchableOpacity>
        {!universeId ? (
          <Text style={styles.inlineError}>Escolha um universo para gerar.</Text>
        ) : null}
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
  newArcChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    borderStyle: 'dashed',
    backgroundColor: '#ffffff',
  },
  newArcChipText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
  },
  arcForm: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  arcInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1E1B4B',
  },
  arcCreateBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  arcCreateBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  arcCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  arcCancelBtnText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  geoHint: {
    fontSize: 13,
    color: '#15803D',
    marginTop: 6,
  },
  inlineError: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 8,
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
    paddingHorizontal: 32,
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
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#7C3AED',
    fontWeight: '700',
    fontSize: 15,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 8,
    textAlign: 'center',
  },
  successStoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
    textAlign: 'center',
  },
  weatherChip: {
    backgroundColor: '#EDE9FE',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  weatherChipText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '600',
  },
});
