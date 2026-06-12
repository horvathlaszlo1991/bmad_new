import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

export default function LicenceScreen() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library to upload your licence.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setError('');
    }
  }

  async function handleUpload() {
    if (!imageUri) {
      setError('Please select an image of your driver licence.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Session expired. Please sign in again.');
        setLoading(false);
        return;
      }

      const ext = imageUri.split('.').pop() ?? 'jpg';
      const storagePath = `${user.id}/${Date.now()}.${ext}`;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('licences')
        .upload(storagePath, blob, {
          contentType: `image/${ext}`,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('driver_verifications')
        .insert({
          user_id: user.id,
          licence_storage_path: storagePath,
        });

      if (insertError) throw insertError;

      router.replace('/(app)');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.headline}>Upload your driver licence</Text>
      <Text style={styles.subtitle}>
        We need a photo of both sides of your licence for manual review. Your
        image is stored securely and is never shared with other users.
      </Text>

      <Pressable
        style={styles.pickerArea}
        onPress={pickImage}
        accessibilityRole="button"
        accessibilityLabel="Choose licence image"
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.pickerPlaceholder}>
            <Text style={styles.pickerIcon}>📄</Text>
            <Text style={styles.pickerText}>Tap to choose a photo</Text>
            <Text style={styles.pickerHint}>JPEG or PNG, up to 10 MB</Text>
          </View>
        )}
      </Pressable>

      {imageUri && (
        <Pressable
          style={styles.changeLink}
          onPress={pickImage}
          accessibilityRole="button"
        >
          <Text style={styles.changeLinkText}>Choose a different image</Text>
        </Pressable>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.button, (!imageUri || loading) && styles.buttonDisabled]}
        onPress={handleUpload}
        disabled={!imageUri || loading}
        accessibilityRole="button"
        accessibilityLabel="Upload licence and continue"
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Submit for Review</Text>
        }
      </Pressable>

      <Text style={styles.note}>
        Verification is usually completed within 24 hours. You will be notified
        once approved.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 60,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 28,
  },
  pickerArea: {
    borderWidth: 2,
    borderColor: '#d0d0d0',
    borderRadius: 12,
    borderStyle: 'dashed',
    minHeight: 200,
    overflow: 'hidden',
    marginBottom: 8,
  },
  pickerPlaceholder: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  pickerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4,
  },
  pickerHint: {
    fontSize: 13,
    color: '#999',
  },
  preview: {
    width: '100%',
    height: 240,
  },
  changeLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  changeLinkText: {
    color: '#2563eb',
    fontSize: 14,
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
    textAlign: 'center',
  },
});
