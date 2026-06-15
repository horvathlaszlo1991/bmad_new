import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { resendVerificationEmail } from '@/lib/auth';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : (params.email ?? '');

  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState('');

  async function handleResend() {
    setResending(true);
    setError('');
    setResendSent(false);
    const err = await resendVerificationEmail(email);
    setResending(false);
    if (err) {
      setError(err);
    } else {
      setResendSent(true);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.headline}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>
        <Text style={styles.instruction}>
          Click the link in the email to continue. This screen will update automatically.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {resendSent ? (
          <Text style={styles.successText}>Confirmation email resent!</Text>
        ) : (
          <Pressable
            style={[styles.button, resending && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={resending}
            accessibilityRole="button"
          >
            {resending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Resend confirmation email</Text>
            }
          </Pressable>
        )}

        <Pressable
          onPress={() => router.back()}
          style={styles.backLink}
          accessibilityRole="button"
        >
          <Text style={styles.backLinkText}>Wrong email? Go back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  headline: { fontSize: 32, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 8, lineHeight: 24 },
  email: { fontWeight: '600', color: '#1a1a1a' },
  instruction: { fontSize: 15, color: '#888', marginBottom: 40, lineHeight: 22 },
  errorText: { color: '#e53e3e', fontSize: 14, marginBottom: 12 },
  successText: { color: '#16a34a', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backLink: { alignItems: 'center', marginTop: 24 },
  backLinkText: { color: '#2563eb', fontSize: 15 },
});
