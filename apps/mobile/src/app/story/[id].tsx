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
import { getStory, createReport } from '../../lib/api';
import type { Story } from '@storygen/shared';

const REPORT_REASONS = [
  'Conteúdo inadequado',
  'Assustador',
  'Outro',
] as const;

const MAX_REPORT_DETAILS = 1000;

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
                    style={[modalStyles.chip, reason === r && modalStyles.chipActive]}
                    onPress={() => setReason(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Motivo: ${r}`}
                  >
                    <Text style={[modalStyles.chipText, reason === r && modalStyles.chipTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={modalStyles.label}>Detalhes (opcional)</Text>
              <TextInput
                style={modalStyles.textArea}
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
                  style={modalStyles.cancelButton}
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

export default function StoryScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();

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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'História não encontrada.'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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

  return (
    <ScrollView
      style={styles.scroll}
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
          <Text style={styles.backLink}>← Voltar</Text>
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
    borderColor: '#DDD6FE',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  textArea: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
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
    borderColor: '#DDD6FE',
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
    backgroundColor: '#FAF5FF',
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
    backgroundColor: '#FAF5FF',
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
    color: '#7C3AED',
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
    marginBottom: 32,
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
    backgroundColor: '#7C3AED',
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
