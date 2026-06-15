import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { getMyRoutes, type Route } from '@/lib/routes';

const DAY_LABELS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#166534' },
  paused: { bg: '#fef9c3', text: '#854d0e' },
};

function daysLabel(days: number[]): string {
  return days.map((d) => DAY_LABELS[d - 1]).join(' ');
}

function formatTime(time: string): string {
  // "HH:MM:SS" → "HH:MM"
  return time.slice(0, 5);
}

export default function RoutesIndex() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load profile role + routes whenever tab gains focus
  async function load() {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr) {
      setError(profileErr.message);
      setLoading(false);
      return;
    }

    const userRole = profileData?.role ?? null;
    setRole(userRole);

    if (userRole === 'passenger') {
      setLoading(false);
      return;
    }

    try {
      const data = await getMyRoutes(user.id);
      setRoutes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Passenger locked state
  if (role === 'passenger') {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockedTitle}>Route posting is for drivers only</Text>
        <Text style={styles.lockedSubtitle}>
          Update your role to Driver or Both to create commute routes.
        </Text>
        <Pressable
          style={styles.linkButton}
          onPress={() => router.push('/(auth)/role')}
          accessibilityRole="button"
        >
          <Text style={styles.linkButtonText}>Update my role</Text>
        </Pressable>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.linkButton}
          onPress={() => { setError(null); load(); }}
        >
          <Text style={styles.linkButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.heading}>My Routes</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/(app)/routes/new')}
          accessibilityRole="button"
          accessibilityLabel="Add new route"
        >
          <Text style={styles.addButtonText}>+ Add Route</Text>
        </Pressable>
      </View>

      {routes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No routes yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your first commute route to start matching with passengers.
          </Text>
          <Pressable
            style={styles.ctaButton}
            onPress={() => router.push('/(app)/routes/new')}
            accessibilityRole="button"
          >
            <Text style={styles.ctaButtonText}>Add Route</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {routes.map((route) => {
            const badge = STATUS_CONFIG[route.status] ?? { bg: '#f3f4f6', text: '#6b7280' };
            return (
              <View key={route.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardBody}>
                    <Text style={styles.addressFrom} numberOfLines={1}>
                      {route.origin_address}
                    </Text>
                    <Text style={styles.arrow}>↓</Text>
                    <Text style={styles.addressTo} numberOfLines={1}>
                      {route.destination_address}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusText, { color: badge.text }]}>
                      {route.status.charAt(0).toUpperCase() + route.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>{daysLabel(route.schedule_days)}</Text>
                  <Text style={styles.metaDivider}>·</Text>
                  <Text style={styles.metaText}>{formatTime(route.departure_time)}</Text>
                  <Text style={styles.metaDivider}>·</Text>
                  <Text style={styles.metaText}>±{route.detour_tolerance_km} km</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  container: { flex: 1, backgroundColor: '#f8fafc' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  heading: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardBody: { flex: 1, marginRight: 10 },
  addressFrom: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  arrow: { fontSize: 14, color: '#9ca3af', marginVertical: 2 },
  addressTo: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  statusChip: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  metaText: { fontSize: 13, color: '#6b7280' },
  metaDivider: { marginHorizontal: 6, color: '#d1d5db' },

  // Locked / empty states
  lockedTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  lockedSubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  linkButton: { borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  linkButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  errorText: { color: '#e53e3e', fontSize: 15, marginBottom: 16, textAlign: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 28 },
  ctaButton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  ctaButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
