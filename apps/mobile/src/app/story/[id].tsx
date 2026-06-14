import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../auth/AuthContext';
import { getStory } from '../../lib/api';
import type { Story } from '@storygen/shared';

export default function StoryScreen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = useRouter() as any;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Voltar para a lista"
      >
        <Text style={styles.backLink}>← Voltar</Text>
      </TouchableOpacity>

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
    </ScrollView>
  );
}

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
  backRow: {
    marginBottom: 24,
  },
  backLink: {
    fontSize: 16,
    color: '#7C3AED',
    fontWeight: '600',
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
