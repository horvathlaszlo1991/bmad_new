import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library to upload an avatar.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setAvatarUri(asset.uri);
      setAvatarMimeType(asset.mimeType ?? 'image/jpeg');
    }
  }

  async function uploadAvatar(userId: string): Promise<{ url: string | null; failed: boolean }> {
    if (!avatarUri) return { url: null, failed: false };
    try {
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      const ext = mimeToExt[avatarMimeType] ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const response = await fetch(avatarUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: avatarMimeType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return { url: data.publicUrl, failed: false };
    } catch {
      return { url: null, failed: true };
    }
  }

  async function handleContinue() {
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const { url: avatarUrl, failed: avatarFailed } = await uploadAvatar(user.id);
    if (avatarFailed) {
      setWarning('Could not upload photo — continuing without it.');
    }
    if (avatarUrl) {
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: avatarUrl }, { onConflict: 'id' });
      if (upsertError) {
        setLoading(false);
        setError(upsertError.message);
        return;
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setLoading(false);

    if ((profile?.role ?? '') === 'driver' || (profile?.role ?? '') === 'both') {
      router.push('/(auth)/licence');
    } else {
      router.replace('/(app)');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>Add a profile photo</Text>
        <Text style={styles.subtitle}>
          Help other commuters recognise you. This step is optional.
        </Text>

        <Pressable
          style={styles.avatarContainer}
          onPress={pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Upload profile photo"
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
            </View>
          )}
        </Pressable>

        {warning ? <Text style={styles.warningText}>{warning}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Continue</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 60, alignItems: 'center' },
  headline: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, alignSelf: 'flex-start' },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 40, alignSelf: 'flex-start' },
  avatarContainer: { marginBottom: 40 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e8f0fe', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2563eb', borderStyle: 'dashed' },
  avatarPlaceholderText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  warningText: { color: '#b45309', fontSize: 14, marginBottom: 8, alignSelf: 'flex-start' },
  errorText: { color: '#e53e3e', fontSize: 14, marginBottom: 12, alignSelf: 'flex-start' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
