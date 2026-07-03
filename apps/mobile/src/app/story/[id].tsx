import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../auth/AuthContext';
import { getStory, createReport, updateStoryVisibility, ApiError } from '../../lib/api';
import { useAppTheme } from '../../theme/AppThemeContext';
import type { Story } from '@storygen/shared';

const REPORT_REASONS = [
  'Conteúdo inadequado',
  'Assustador',
  'Outro',
] as const;

const MAX_REPORT_DETAILS = 1000;

type Visibility = 'PRIVATE' | 'PUBLIC' | 'PAID';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'PRIVATE', label: 'Privada' },
  { value: 'PUBLIC', label: 'Pública' },
  { value: 'PAID', label: 'Paga' },
];

function ReportModal({
  visible,
  storyId,
  accessToken,
  onClose,
}: {
  visible: boolean;
  storyId: string;
  accessToken: string;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setReason(null);
    setDetails('');
    setSending(false);
    setError(null);
    setSent(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      await createReport(
        {
          targetType: 'STORY',
          targetId: storyId,
          reason,
          details: details.trim() || undefined,
        },
        accessToken,
      );
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar denúncia. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.panel}>
          {sent ? (
            <>
              <Text style={modalStyles.title}>Denúncia enviada</Text>
              <Text style={modalStyles.successText}>
                Obrigado por ajudar a manter o conteúdo seguro. Nossa equipe irá revisar.
              </Text>
              <TouchableOpacity
                style={modalStyles.submitButton}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Text style={modalStyles.submitButtonText}>Fechar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={modalStyles.title}>Denunciar história</Text>
              <Text style={modalStyles.label}>Motivo</Text>
              <View style={modalStyles.chipRow}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      modalStyles.chip,
                      { borderColor: theme.primarySoft },
                      reason === r && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => setReason(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Motivo: ${r}`}
                  >
                    <Text
                      style={[
                        modalStyles.chipText,
                        { color: reason === r ? '#ffffff' : theme.primary },
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={modalStyles.label}>Detalhes (opcional)</Text>
              <TextInput
                style={[
                  modalStyles.textArea,
                  { backgroundColor: theme.bg, borderColor: theme.primarySoft },
                ]}
                placeholder="Conte o que aconteceu..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                maxLength={MAX_REPORT_DETAILS}
                value={details}
                onChangeText={setDetails}
                textAlignVertical="top"
                accessibilityLabel="Detalhes da denúncia"
                {...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})}
              />

              {error ? <Text style={modalStyles.errorText}>{error}</Text> : null}

              <View style={modalStyles.actions}>
                <TouchableOpacity
                  style={[modalStyles.cancelButton, { borderColor: theme.primarySoft }]}
                  onPress={handleClose}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar denúncia"
                >
                  <Text style={modalStyles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    modalStyles.submitButton,
                    (!reason || sending) && modalStyles.submitButtonDisabled,
                  ]}
                  onPress={() => void handleSubmit()}
                  disabled={!reason || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar denúncia"
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={modalStyles.submitButtonText}>Enviar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Controle de visibilidade — só o GERADOR da história vê (SDD §6.4).
 * PUBLIC exige moderação APPROVED → 422 CONTENT_NOT_APPROVED.
 */
function VisibilityControl({
  story,
  accessToken,
  onChanged,
}: {
  story: Story;
  accessToken: string;
  onChanged: (visibility: Visibility) => void;
}) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSelect(visibility: Visibility) {
    if (busy || visibility === story.visibility) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await updateStoryVisibility(story.id, visibility, accessToken);
      onChanged(res.visibility);
      setIsError(false);
      setMessage('Visibilidade atualizada.');
    } catch (e: unknown) {
      setIsError(true);
      if (e instanceof ApiError && e.code === 'CONTENT_NOT_APPROVED') {
        setMessage('História ainda não aprovada pela moderação.');
      } else if (e instanceof ApiError) {
        setMessage(e.message);
      } else {
        setMessage('Erro ao atualizar a visibilidade. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.visibilityBox}>
      <Text style={styles.visibilityLabel}>Visibilidade da história</Text>
      <View style={styles.visibilityRow}>
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = story.visibility === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.visibilityChip,
                { borderColor: theme.primarySoft },
                active && {
                  backgroundColor: theme.primary,
                  borderColor: theme.primary,
                },
              ]}
              onPress={() => void handleSelect(opt.value)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: busy }}
              accessibilityLabel={`Tornar história ${opt.label.toLowerCase()}`}
            >
              <Text
                style={[
                  styles.visibilityChipText,
                  { color: active ? '#ffffff' : theme.primary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
      </View>
      {message ? (
        <Text style={[styles.visibilityMessage, isError && styles.visibilityMessageError]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export default function StoryScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, userId } = useAuth();
  const theme = useAppTheme();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!id || !accessToken) return;
    setLoading(true);
    getStory(id, accessToken)
      .then(setStory)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar história.');
      })
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={styles.errorText}>{error ?? 'História não encontrada.'}</Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.primary }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Split content into paragraphs for accessible display
  const paragraphs = story.content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const weather = story.metadata_weather ?? null;
  const isGenerator = Boolean(userId && story.user_id && userId === story.user_id);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      accessible
      accessibilityLabel={`História: ${story.title}`}
    >
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a lista"
        >
          <Text style={[styles.backLink, { color: theme.primary }]}>← Voltar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => setReportOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Denunciar esta história"
        >
          <Text style={styles.reportButtonText}>🚩 Denunciar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {story.title}
      </Text>

      {weather ? (
        <View
          style={[styles.weatherChip, { backgroundColor: theme.primarySoft }]}
          accessible
          accessibilityLabel={`Clima da história: ${weather.condition}, ${Math.round(weather.temp)} graus, ${weather.time}`}
        >
          <Text style={[styles.weatherChipText, { color: theme.primary }]}>
            🌤 {weather.condition}, {Math.round(weather.temp)}°C{' · '}{weather.time}
          </Text>
        </View>
      ) : null}

      {isGenerator && accessToken ? (
        <VisibilityControl
          story={story}
          accessToken={accessToken}
          onChanged={(visibility) =>
            setStory((s) => (s ? { ...s, visibility } : s))
          }
        />
      ) : null}

      {paragraphs.map((paragraph, index) => (
        <Text
          key={index}
          style={styles.paragraph}
          accessibilityLabel={paragraph}
        >
          {paragraph}
        </Text>
      ))}

      {accessToken ? (
        <ReportModal
          visible={reportOpen}
          storyId={story.id}
          accessToken={accessToken}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(30, 27, 75, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 440,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1E1B4B',
    minHeight: 90,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 10,
  },
  successText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  submitButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 64,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backRow: {
    paddingVertical: 4,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  reportButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  reportButtonText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E1B4B',
    lineHeight: 40,
    marginBottom: 16,
  },
  weatherChip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  weatherChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  visibilityBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  visibilityLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  visibilityChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
  },
  visibilityChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  visibilityMessage: {
    fontSize: 13,
    color: '#15803D',
    marginTop: 8,
  },
  visibilityMessageError: {
    color: '#DC2626',
  },
  paragraph: {
    fontSize: 20,
    lineHeight: 34,
    color: '#374151',
    marginBottom: 20,
    letterSpacing: 0.2,
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
});
