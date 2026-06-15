import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { login, resendVerificationEmail } from '@/lib/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  function clearError() {
    setError('');
    setEmailNotConfirmed(false);
    setResendSent(false);
  }

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    clearError();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.error) {
      if (result.emailNotConfirmed) setEmailNotConfirmed(true);
      setError(result.error);
      return;
    }

    router.replace('/(app)');
  }

  async function handleResend() {
    setResendLoading(true);
    const err = await resendVerificationEmail(email);
    setResendLoading(false);
    if (err) {
      setError(err);
    } else {
      setResendSent(true);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.headline}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your CommutShare account.</Text>

        <TextInput
          style={[styles.input, error && !emailNotConfirmed ? styles.inputError : null]}
          value={email}
          onChangeText={(t) => { setEmail(t); clearError(); }}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput, error && !emailNotConfirmed ? styles.inputError : null]}
            value={password}
            onChangeText={(t) => { setPassword(t); clearError(); }}
            placeholder="Password"
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <Pressable
            style={styles.showHideBtn}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.showHideText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {emailNotConfirmed && (
          <View style={styles.resendRow}>
            {resendSent ? (
              <Text style={styles.resendSentText}>Verification email sent!</Text>
            ) : (
              <Pressable
                onPress={handleResend}
                disabled={resendLoading}
                accessibilityRole="button"
              >
                {resendLoading
                  ? <ActivityIndicator size="small" color="#2563eb" />
                  : <Text style={styles.resendLink}>Resend verification email</Text>
                }
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </Pressable>

        <Pressable
          style={styles.registerLink}
          onPress={() => router.replace('/(auth)/register')}
          accessibilityRole="button"
        >
          <Text style={styles.registerLinkText}>
            New here?{' '}
            <Text style={styles.registerLinkBold}>Create an account</Text>
          </Text>
        </Pressable>

        {__DEV__ && (
          <Pressable
            style={styles.devButton}
            onPress={async () => {
              clearError();
              setLoading(true);
              const result = await login('dev@commuteshare.local', 'Dev1234!');
              setLoading(false);
              if (result.error) setError(result.error);
              else router.replace('/(app)');
            }}
            accessibilityRole="button"
            accessibilityLabel="Dev login"
          >
            <Text style={styles.devButtonText}>⚡ Dev Login</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  headline: { fontSize: 32, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 32, lineHeight: 24 },
  input: { borderWidth: 1.5, borderColor: '#d0d0d0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1a1a1a', marginBottom: 12 },
  inputError: { borderColor: '#e53e3e' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  passwordInput: { flex: 1, marginBottom: 0 },
  showHideBtn: { position: 'absolute', right: 14, padding: 4 },
  showHideText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#e53e3e', fontSize: 14, marginBottom: 12 },
  resendRow: { marginBottom: 12 },
  resendLink: { color: '#2563eb', fontSize: 14, textDecorationLine: 'underline' },
  resendSentText: { color: '#16a34a', fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  registerLink: { alignItems: 'center', marginTop: 20 },
  registerLinkText: { fontSize: 15, color: '#666' },
  registerLinkBold: { color: '#2563eb', fontWeight: '600' },
  devButton: { alignItems: 'center', marginTop: 24, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  devButtonText: { color: '#b45309', fontSize: 14, fontWeight: '700' },
});
