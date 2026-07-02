import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../theme/AppThemeContext';
import { createUniverse, addCharacter, addTheme, ApiError } from '../lib/api';

type Step = 'universe' | 'character' | 'theme' | 'done';

type UniverseVisibility = 'PRIVATE' | 'PUBLIC';

const VISIBILITY_OPTIONS: { value: UniverseVisibility; label: string }[] = [
  { value: 'PRIVATE', label: 'Privado' },
  { value: 'PUBLIC', label: 'Público' },
];

type Classification = 'PRINCIPAL' | 'SECUNDARIO' | 'ANTAGONISTA' | 'MASCOTE';

const CLASSIFICATIONS: { value: Classification; label: string }[] = [
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'SECUNDARIO', label: 'Secundário' },
  { value: 'ANTAGONISTA', label: 'Antagonista' },
  { value: 'MASCOTE', label: 'Mascote' },
];

const AGE_GROUPS = [
  { value: '', label: 'Qualquer' },
  { value: '0_3', label: '0–3 anos' },
  { value: '4_6', label: '4–6 anos' },
  { value: '7_9', label: '7–9 anos' },
  { value: '10_12', label: '10–12 anos' },
];

export default function CreateUniverseScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();
  const theme = useAppTheme();

  const [step, setStep] = useState<Step>('universe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Universe fields (RF-10)
  const [universeTitle, setUniverseTitle] = useState('');
  const [universeDescription, setUniverseDescription] = useState('');
  const [universeVisibility, setUniverseVisibility] = useState<UniverseVisibility>('PRIVATE');
  const [locationContext, setLocationContext] = useState('');
  const [universeId, setUniverseId] = useState<string | null>(null);

  // Character fields
  const [characterName, setCharacterName] = useState('');
  const [characterTraits, setCharacterTraits] = useState('');
  const [characterClassification, setCharacterClassification] =
    useState<Classification>('PRINCIPAL');
  const [characterAgeGroup, setCharacterAgeGroup] = useState('');

  // Theme fields
  const [themeTitle, setThemeTitle] = useState('');

  const chipStyle = (active: boolean) => [
    styles.chip,
    { borderColor: theme.primarySoft },
    active && { backgroundColor: theme.primary, borderColor: theme.primary },
  ];
  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    { color: active ? '#ffffff' : theme.primary },
  ];

  async function handleCreateUniverse() {
    if (!accessToken) return;
    if (!universeTitle.trim()) {
      setError('O título do universo é obrigatório.');
      return;
    }
    if (!universeDescription.trim()) {
      setError('A descrição do universo é obrigatória.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await createUniverse(
        {
          title: universeTitle.trim(),
          description: universeDescription.trim(),
          visibility: universeVisibility,
          ...(locationContext.trim()
            ? { location_context: locationContext.trim() }
            : {}),
        },
        accessToken,
      );
      setUniverseId(result.id);
      setStep('character');
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Erro ao criar universo. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCharacter() {
    if (!accessToken || !universeId) return;
    if (!characterName.trim()) {
      setError('O nome do personagem é obrigatório.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const traits = characterTraits
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      await addCharacter(
        universeId,
        {
          name: characterName.trim(),
          classification: characterClassification,
          ...(characterAgeGroup ? { ageGroup: characterAgeGroup } : {}),
          traits,
        },
        accessToken,
      );
      setStep('theme');
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Erro ao adicionar personagem. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTheme() {
    if (!accessToken || !universeId) return;
    if (!themeTitle.trim()) {
      setError('O título do tema é obrigatório.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await addTheme(universeId, { title: themeTitle.trim() }, accessToken);
      setStep('done');
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Erro ao adicionar tema. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSkipTheme() {
    setStep('done');
  }

  function handleFinish() {
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={[styles.backLink, { color: theme.primary }]}>← Voltar</Text>
        </TouchableOpacity>

        <Text style={styles.heading} accessibilityRole="header">Criar Universo</Text>

        {/* Step indicator */}
        <View style={styles.stepsRow}>
          {(['universe', 'character', 'theme'] as const).map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                (step === s || (step === 'done' && i < 3)) && {
                  backgroundColor: theme.primary,
                },
              ]}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ── Step 1: Universe ── */}
        {step === 'universe' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Detalhes do Universo</Text>

            <Text style={styles.label}>Título *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: O Reino das Estrelas"
              placeholderTextColor="#9CA3AF"
              value={universeTitle}
              onChangeText={setUniverseTitle}
              maxLength={255}
              accessible
              accessibilityLabel="Título do universo"
            />

            <Text style={styles.label}>Descrição *</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Descreva o universo, o cenário e a vibe das histórias..."
              placeholderTextColor="#9CA3AF"
              value={universeDescription}
              onChangeText={setUniverseDescription}
              multiline
              numberOfLines={4}
              maxLength={2000}
              accessible
              accessibilityLabel="Descrição do universo"
            />

            <Text style={styles.label}>Visibilidade</Text>
            <View style={styles.chipRow}>
              {VISIBILITY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={chipStyle(universeVisibility === opt.value)}
                  onPress={() => setUniverseVisibility(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: universeVisibility === opt.value }}
                  accessibilityLabel={`Visibilidade: ${opt.label}`}
                >
                  <Text style={chipTextStyle(universeVisibility === opt.value)}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Cidade ou lugar do universo (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: São Paulo, uma vila na praia..."
              placeholderTextColor="#9CA3AF"
              value={locationContext}
              onChangeText={setLocationContext}
              maxLength={500}
              accessible
              accessibilityLabel="Cidade ou lugar do universo"
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={() => void handleCreateUniverse()}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Continuar para personagem"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continuar →</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Character ── */}
        {step === 'character' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Primeiro Personagem</Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Luna"
              placeholderTextColor="#9CA3AF"
              value={characterName}
              onChangeText={setCharacterName}
              maxLength={255}
              accessible
              accessibilityLabel="Nome do personagem"
            />

            <Text style={styles.label}>Classificação</Text>
            <View style={styles.chipRow}>
              {CLASSIFICATIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={chipStyle(characterClassification === c.value)}
                  onPress={() => setCharacterClassification(c.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: characterClassification === c.value }}
                  accessibilityLabel={`Classificação: ${c.label}`}
                >
                  <Text style={chipTextStyle(characterClassification === c.value)}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Faixa etária (opcional)</Text>
            <View style={styles.chipRow}>
              {AGE_GROUPS.map((ag) => (
                <TouchableOpacity
                  key={ag.value}
                  style={chipStyle(characterAgeGroup === ag.value)}
                  onPress={() => setCharacterAgeGroup(ag.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: characterAgeGroup === ag.value }}
                  accessibilityLabel={`Faixa etária: ${ag.label}`}
                >
                  <Text style={chipTextStyle(characterAgeGroup === ag.value)}>
                    {ag.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Traços (separados por vírgula)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: corajosa, curiosa, amigável"
              placeholderTextColor="#9CA3AF"
              value={characterTraits}
              onChangeText={setCharacterTraits}
              accessible
              accessibilityLabel="Traços do personagem"
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={() => void handleAddCharacter()}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Adicionar personagem e continuar"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continuar →</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Theme ── */}
        {step === 'theme' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Tema das Histórias</Text>

            <Text style={styles.label}>Título do Tema *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Aventuras na Floresta"
              placeholderTextColor="#9CA3AF"
              value={themeTitle}
              onChangeText={setThemeTitle}
              maxLength={255}
              accessible
              accessibilityLabel="Título do tema"
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={() => void handleAddTheme()}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Adicionar tema e finalizar"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Finalizar</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkipTheme}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Pular tema"
            >
              <Text style={styles.skipButtonText}>Pular por enquanto</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <View style={styles.section}>
            <Text style={styles.successTitle}>Universo criado!</Text>
            <Text style={styles.successText}>
              Seu universo está pronto. Agora você pode gerar histórias nele.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={handleFinish}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Ir para meus universos"
            >
              <Text style={styles.primaryButtonText}>Ver meus universos</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 64,
  },
  backRow: {
    marginBottom: 16,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 16,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E1B4B',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1E1B4B',
  },
  inputMulti: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
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
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  skipButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#065F46',
    textAlign: 'center',
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
});
