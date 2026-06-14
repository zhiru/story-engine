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
import { createUniverse, addCharacter, addTheme, ApiError } from '../lib/api';

type Step = 'universe' | 'character' | 'theme' | 'done';

export default function CreateUniverseScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { accessToken } = useAuth();

  const [step, setStep] = useState<Step>('universe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Universe fields
  const [universeTitle, setUniverseTitle] = useState('');
  const [universeDescription, setUniverseDescription] = useState('');
  const [universeId, setUniverseId] = useState<string | null>(null);

  // Character fields
  const [characterName, setCharacterName] = useState('');
  const [characterTraits, setCharacterTraits] = useState('');

  // Theme fields
  const [themeTitle, setThemeTitle] = useState('');

  async function handleCreateUniverse() {
    if (!accessToken) return;
    if (!universeTitle.trim()) {
      setError('O titulo do universo e obrigatorio.');
      return;
    }
    if (!universeDescription.trim()) {
      setError('A descricao do universo e obrigatoria.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await createUniverse(
        { title: universeTitle.trim(), description: universeDescription.trim() },
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
      setError('O nome do personagem e obrigatorio.');
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
        { name: characterName.trim(), classification: 'PRINCIPAL', traits },
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
      setError('O titulo do tema e obrigatorio.');
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
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Text style={styles.backLink}>← Voltar</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Criar Universo</Text>

        {/* Step indicator */}
        <View style={styles.stepsRow}>
          {(['universe', 'character', 'theme'] as const).map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                (step === s || (step === 'done' && i < 3)) && styles.stepDotActive,
              ]}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ── Step 1: Universe ── */}
        {step === 'universe' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Detalhes do Universo</Text>

            <Text style={styles.label}>Titulo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: O Reino das Estrelas"
              value={universeTitle}
              onChangeText={setUniverseTitle}
              maxLength={255}
              accessible
              accessibilityLabel="Titulo do universo"
            />

            <Text style={styles.label}>Descricao *</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Descreva o universo, o cenario e a vibe das historias..."
              value={universeDescription}
              onChangeText={setUniverseDescription}
              multiline
              numberOfLines={4}
              maxLength={2000}
              accessible
              accessibilityLabel="Descricao do universo"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
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
            <Text style={styles.sectionTitle}>2. Personagem Principal</Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Luna"
              value={characterName}
              onChangeText={setCharacterName}
              maxLength={255}
              accessible
              accessibilityLabel="Nome do personagem"
            />

            <Text style={styles.label}>Tracos (separados por virgula)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: corajosa, curiosa, amigavel"
              value={characterTraits}
              onChangeText={setCharacterTraits}
              accessible
              accessibilityLabel="Tracos do personagem"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
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
            <Text style={styles.sectionTitle}>3. Tema das Historias</Text>

            <Text style={styles.label}>Titulo do Tema *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Aventuras na Floresta"
              value={themeTitle}
              onChangeText={setThemeTitle}
              maxLength={255}
              accessible
              accessibilityLabel="Titulo do tema"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
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
              Seu universo esta pronto. Agora voce pode gerar historias nele.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
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
    backgroundColor: '#FAF5FF',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#FAF5FF',
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
    color: '#7C3AED',
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
  stepDotActive: {
    backgroundColor: '#7C3AED',
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
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonDisabled: {
    backgroundColor: '#A78BFA',
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
