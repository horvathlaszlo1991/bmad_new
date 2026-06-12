import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { verifyEmailOtp, resendVerificationEmail } from '@/lib/auth';

const OTP_LENGTH = 6;
const EXPIRY_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 3;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : (params.email ?? '');

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const isExpired = secondsLeft === 0;
  const isLocked = attempts >= MAX_ATTEMPTS;
  const isDisabled = loading || isLocked || isExpired;

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function handleVerify(value: string) {
    if (value.length < OTP_LENGTH) return;
    setError('');
    setLoading(true);

    const err = await verifyEmailOtp(email ?? '', value);

    if (!err) {
      // Session is active — create the profiles row from user_metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setError('Session error after verification. Please sign in.');
        return;
      }
      const username = (user.user_metadata?.username as string) ?? '';
      const phone = (user.user_metadata?.phone as string) ?? null;
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: user.id, username, phone });
      if (profileError) {
        setLoading(false);
        setError('Account verified but profile setup failed. Please try again.');
        return;
      }
      setLoading(false);
      router.replace('/(auth)/role');
      return;
    }

    setLoading(false);
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setCode('');

    if (newAttempts >= MAX_ATTEMPTS) {
      setError('Too many incorrect attempts. Please request a new code.');
    } else {
      setError(`Incorrect code. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    const err = await resendVerificationEmail(email ?? '');
    setResending(false);

    if (err) {
      setError(err);
      return;
    }

    setCode('');
    setAttempts(0);
    setSecondsLeft(EXPIRY_SECONDS);
    inputRef.current?.focus();
  }

  function handleChangeText(text: string) {
    if (isDisabled) return;
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    setError('');
    if (digits.length === OTP_LENGTH) handleVerify(digits);
  }

  const showResend = isLocked || isExpired;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.headline}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{' '}
          <Text style={styles.email}>{email}</Text>
        </Text>

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            error ? styles.inputError : null,
            isDisabled ? styles.inputDisabled : null,
          ]}
          value={code}
          onChangeText={handleChangeText}
          placeholder="------"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          editable={!isDisabled}
          autoFocus
        />

        {!isExpired && !isLocked && (
          <Text style={styles.timer}>
            Code expires in{' '}
            <Text style={secondsLeft < 60 ? styles.timerWarning : undefined}>
              {formatTime(secondsLeft)}
            </Text>
          </Text>
        )}

        {isExpired && !isLocked && (
          <Text style={styles.errorText}>Your code has expired.</Text>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading && <ActivityIndicator style={styles.spinner} />}

        {showResend && (
          <Pressable
            style={[styles.button, resending && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={resending}
            accessibilityRole="button"
            accessibilityLabel="Resend verification code"
          >
            {resending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Resend Code</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },
  headline: { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 32, lineHeight: 22 },
  email: { fontWeight: '600', color: '#1a1a1a' },
  input: { borderWidth: 1.5, borderColor: '#d0d0d0', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14, fontSize: 28, letterSpacing: 12, textAlign: 'center', color: '#1a1a1a', marginBottom: 12 },
  inputError: { borderColor: '#e53e3e' },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#aaa' },
  timer: { fontSize: 13, color: '#666', marginBottom: 8, textAlign: 'center' },
  timerWarning: { color: '#e53e3e', fontWeight: '600' },
  errorText: { color: '#e53e3e', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  spinner: { marginVertical: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backLink: { marginTop: 24, alignItems: 'center' },
  backLinkText: { color: '#2563eb', fontSize: 15 },
});
