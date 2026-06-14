import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';

const CURRENT_POLICY_VERSION = '1.0';

export default function ConsentScreen() {
  const { grantConsent, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsent() {
    setError(null);
    setLoading(true);
    try {
      await grantConsent({
        consent_type: 'PARENTAL_DATA',
        policy_version: CURRENT_POLICY_VERSION,
        granted: true,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Parental Consent</Text>
      <Text style={styles.body}>
        StoryGen creates personalised stories for children. To continue, we need your consent to process your child's data in accordance with our Privacy Policy (v{CURRENT_POLICY_VERSION}).
      </Text>
      <Text style={styles.body}>
        By tapping "I Agree", you confirm you are the parent or legal guardian and consent to the collection and use of your child's data as described in our Privacy Policy.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={() => { void handleConsent(); }} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>I Agree</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => { void signOut(); }}>
        <Text style={styles.secondaryText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#208AEF', marginBottom: 16 },
  body: { fontSize: 15, color: '#444', marginBottom: 12, textAlign: 'center', lineHeight: 22 },
  button: { width: '100%', backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { marginTop: 12, padding: 12 },
  secondaryText: { color: '#666', fontSize: 14 },
  error: { color: '#e00', marginBottom: 8, textAlign: 'center' },
});
