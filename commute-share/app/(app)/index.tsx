import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';

type Profile = {
  username: string | null;
  avatar_url: string | null;
  role: 'driver' | 'passenger' | 'both' | null;
};

type VerificationStatus = 'pending' | 'approved' | 'rejected';

type DriverVerification = {
  verification_status: VerificationStatus;
};

const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  passenger: 'Passenger',
  both: 'Driver & Passenger',
};

const BADGE_CONFIG: Record<VerificationStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending verification', bg: '#fef9c3', text: '#854d0e' },
  approved: { label: 'Verified driver', bg: '#dcfce7', text: '#166534' },
  rejected: { label: 'Verification rejected', bg: '#fee2e2', text: '#991b1b' },
};

export default function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verification, setVerification] = useState<DriverVerification | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoadingProfile(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadingProfile(false);
      return;
    }

    const [{ data: profileData }, { data: verData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, avatar_url, role')
        .eq('id', user.id)
        .single(),
      supabase
        .from('driver_verifications')
        .select('verification_status')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setProfile(profileData ?? null);
    setVerification(verData ?? null);
    setLoadingProfile(false);
  }

  if (loadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const isDriver = profile?.role === 'driver' || profile?.role === 'both';
  const badgeConfig = verification ? BADGE_CONFIG[verification.verification_status] : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={styles.avatar}
            accessibilityLabel="Profile photo"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {(profile?.username || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={styles.name}>{profile?.username ?? 'Welcome!'}</Text>

        {profile?.role && (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>
              {ROLE_LABELS[profile.role] ?? profile.role}
            </Text>
          </View>
        )}

        {isDriver && badgeConfig && (
          <View style={[styles.badge, { backgroundColor: badgeConfig.bg }]}>
            <Text style={[styles.badgeText, { color: badgeConfig.text }]}>
              {badgeConfig.label}
            </Text>
          </View>
        )}

        {isDriver && !verification && (
          <View style={[styles.badge, { backgroundColor: '#f3f4f6' }]}>
            <Text style={[styles.badgeText, { color: '#6b7280' }]}>
              No licence submitted yet
            </Text>
          </View>
        )}
      </View>

      <Pressable
        style={styles.signOutButton}
        onPress={() => signOut().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, backgroundColor: '#f8fafc', paddingHorizontal: 24, paddingTop: 48, paddingBottom: 60 },
  header: { alignItems: 'center', marginBottom: 40 },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 16 },
  avatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarFallbackText: { fontSize: 36, fontWeight: '700', color: '#2563eb' },
  name: { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, textAlign: 'center' },
  roleChip: { backgroundColor: '#2563eb', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 10 },
  roleChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  badge: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  signOutButton: { borderWidth: 1.5, borderColor: '#e53e3e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 'auto' },
  signOutText: { color: '#e53e3e', fontSize: 16, fontWeight: '600' },
});
