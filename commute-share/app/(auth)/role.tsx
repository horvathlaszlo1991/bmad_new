import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

type Role = 'driver' | 'passenger' | 'both';

const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: 'passenger',
    label: 'Passenger',
    description: 'I am looking for rides to commute.',
  },
  {
    value: 'driver',
    label: 'Driver',
    description: 'I offer my car to fellow commuters.',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'I offer rides and also travel as a passenger.',
  },
];

export default function RoleScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    if (!selected) {
      setError('Please select a role to continue.');
      return;
    }

    setLoading(true);
    setError('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, role: selected }, { onConflict: 'id' });

    setLoading(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.push('/(auth)/profile');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>How will you use CommutShare?</Text>
      <Text style={styles.subtitle}>
        You can update this later in your settings.
      </Text>

      {ROLES.map((role) => {
        const active = selected === role.value;
        return (
          <Pressable
            key={role.value}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => {
              setSelected(role.value);
              setError('');
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.radio, active && styles.radioActive]}>
              {active && <View style={styles.radioDot} />}
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>
                {role.label}
              </Text>
              <Text style={styles.cardDescription}>{role.description}</Text>
            </View>
          </Pressable>
        );
      })}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.button, (!selected || loading) && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={!selected || loading}
        accessibilityRole="button"
        accessibilityLabel="Continue to profile setup"
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Continue</Text>
        }
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
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
    marginBottom: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#bbb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioActive: {
    borderColor: '#2563eb',
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#2563eb',
  },
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  cardLabelActive: {
    color: '#2563eb',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
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
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
