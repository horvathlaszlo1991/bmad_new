import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { register } from '@/lib/auth';

function isE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,30}$/.test(u);
}

type FieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  phone?: string;
  general?: string;
};

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+36');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  function clearField(field: keyof FieldErrors) {
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleRegister() {
    const next: FieldErrors = {};
    if (!isValidUsername(username)) {
      next.username = 'Username must be 3–30 characters: letters, digits, or underscore.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Please enter a valid email address.';
    }
    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    if (!isE164(phone)) {
      next.phone = 'Enter a phone number in international format (e.g. +36301234567).';
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    setLoading(true);
    const result = await register(username, email, password, phone);
    setLoading(false);

    if (result.error) {
      const field = result.errorField ?? 'general';
      setErrors({ [field]: result.error });
      return;
    }

    router.push({ pathname: '/(auth)/verify-email', params: { email } });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>Create account</Text>
        <Text style={styles.subtitle}>Join CommutShare and share the commute.</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={[styles.input, errors.username ? styles.inputError : null]}
          value={username}
          onChangeText={(t) => { setUsername(t); clearField('username'); }}
          placeholder="e.g. alex_k"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        {errors.username ? <Text style={styles.errorText}>{errors.username}</Text> : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, errors.email ? styles.inputError : null]}
          value={email}
          onChangeText={(t) => { setEmail(t); clearField('email'); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput, errors.password ? styles.inputError : null]}
            value={password}
            onChangeText={(t) => { setPassword(t); clearField('password'); }}
            placeholder="Min. 8 characters"
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
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
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={[styles.input, errors.phone ? styles.inputError : null]}
          value={phone}
          onChangeText={(t) => { setPhone(t); clearField('phone'); }}
          placeholder="+36301234567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}

        {errors.general ? <Text style={styles.errorText}>{errors.general}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create Account</Text>
          }
        </Pressable>

        <Pressable
          style={styles.loginLink}
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
        >
          <Text style={styles.loginLinkText}>
            Already have an account?{' '}
            <Text style={styles.loginLinkBold}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 60 },
  headline: { fontSize: 32, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 32, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#d0d0d0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1a1a1a', marginBottom: 4 },
  inputError: { borderColor: '#e53e3e' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  passwordInput: { flex: 1, marginBottom: 0 },
  showHideBtn: { position: 'absolute', right: 14, padding: 4 },
  showHideText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#e53e3e', fontSize: 13, marginBottom: 10 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { fontSize: 15, color: '#666' },
  loginLinkBold: { color: '#2563eb', fontWeight: '600' },
});
