import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  getMyBookingsAsPassenger,
  getPendingRequestsForDriver,
  respondToBooking,
  type BookingWithDetails,
} from '@/lib/bookings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function StatusBadge({ status }: { status: string }) {
  const badgeStyle = STATUS_STYLES[status] ?? STATUS_STYLES.default;
  return (
    <View style={[styles.badge, badgeStyle.badge]}>
      <Text style={[styles.badgeText, badgeStyle.text]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const STATUS_STYLES: Record<string, { badge: object; text: object }> = {
  pending: {
    badge: { backgroundColor: '#fef9c3' },
    text: { color: '#854d0e' },
  },
  confirmed: {
    badge: { backgroundColor: '#dcfce7' },
    text: { color: '#166534' },
  },
  declined: {
    badge: { backgroundColor: '#fee2e2' },
    text: { color: '#991b1b' },
  },
  cancelled: {
    badge: { backgroundColor: '#f3f4f6' },
    text: { color: '#6b7280' },
  },
  default: {
    badge: { backgroundColor: '#f3f4f6' },
    text: { color: '#6b7280' },
  },
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Segment = 'passenger' | 'driver';

export default function BookingsScreen() {
  const [segment, setSegment] = useState<Segment>('passenger');
  const [userRole, setUserRole] = useState<string | null>(null);

  // Passenger tab state
  const [passengerBookings, setPassengerBookings] = useState<BookingWithDetails[]>([]);
  const [passengerLoading, setPassengerLoading] = useState(false);
  const [passengerError, setPassengerError] = useState<string | null>(null);

  // Driver tab state
  const [driverBookings, setDriverBookings] = useState<BookingWithDetails[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Load user role on mount
  useEffect(() => {
    async function loadRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (!error && data) {
          setUserRole(data.role as string);
        }
      } catch {
        // role defaults to passenger view
      }
    }
    loadRole();
  }, []);

  // Load passenger bookings
  const loadPassengerBookings = useCallback(async () => {
    setPassengerLoading(true);
    setPassengerError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const bookings = await getMyBookingsAsPassenger(user.id);
      setPassengerBookings(bookings);
    } catch (err) {
      setPassengerError(err instanceof Error ? err.message : 'Failed to load bookings.');
    } finally {
      setPassengerLoading(false);
    }
  }, []);

  // Load driver bookings
  const loadDriverBookings = useCallback(async () => {
    setDriverLoading(true);
    setDriverError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const bookings = await getPendingRequestsForDriver(user.id);
      setDriverBookings(bookings);
    } catch (err) {
      setDriverError(err instanceof Error ? err.message : 'Failed to load requests.');
    } finally {
      setDriverLoading(false);
    }
  }, []);

  // Load data when segment changes
  useEffect(() => {
    if (segment === 'passenger') {
      loadPassengerBookings();
    } else {
      loadDriverBookings();
    }
  }, [segment, loadPassengerBookings, loadDriverBookings]);

  // Handle driver accepting/declining a booking
  async function handleRespond(bookingId: string, status: 'confirmed' | 'declined') {
    setRespondingId(bookingId);
    const { error } = await respondToBooking(bookingId, status);
    setRespondingId(null);
    if (!error) {
      // Refresh list after responding
      loadDriverBookings();
    }
  }

  const isDriverOrBoth = userRole === 'driver' || userRole === 'both';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>My Rides</Text>

      {/* ── Segment control ── */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === 'passenger' && styles.segmentBtnActive]}
          onPress={() => setSegment('passenger')}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.segmentText, segment === 'passenger' && styles.segmentTextActive]}
          >
            As Passenger
          </Text>
        </TouchableOpacity>

        {isDriverOrBoth && (
          <TouchableOpacity
            style={[styles.segmentBtn, segment === 'driver' && styles.segmentBtnActive]}
            onPress={() => setSegment('driver')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, segment === 'driver' && styles.segmentTextActive]}
            >
              As Driver
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Passenger tab ── */}
      {segment === 'passenger' && (
        <>
          {passengerLoading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          )}
          {passengerError && !passengerLoading && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{passengerError}</Text>
            </View>
          )}
          {!passengerLoading && !passengerError && passengerBookings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySubtitle}>
                Use the Find Rides tab to request a seat on a driver's route.
              </Text>
            </View>
          )}
          {!passengerLoading &&
            passengerBookings.map((booking) => (
              <View key={booking.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardRoute} numberOfLines={1}>
                    {booking.routes.origin_address}
                  </Text>
                  <StatusBadge status={booking.status} />
                </View>
                <Text style={styles.cardArrow}>↓</Text>
                <Text style={styles.cardRoute} numberOfLines={1}>
                  {booking.routes.destination_address}
                </Text>
                <Text style={styles.cardMeta}>
                  Driver: {booking.profiles.username}
                </Text>
                <Text style={styles.cardMeta}>
                  Departure: {formatTime(booking.routes.departure_time)}
                </Text>
              </View>
            ))}
        </>
      )}

      {/* ── Driver tab ── */}
      {segment === 'driver' && (
        <>
          {driverLoading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          )}
          {driverError && !driverLoading && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{driverError}</Text>
            </View>
          )}
          {!driverLoading && !driverError && driverBookings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySubtitle}>
                When passengers request a seat on your route, they will appear here.
              </Text>
            </View>
          )}
          {!driverLoading &&
            driverBookings.map((booking) => (
              <View key={booking.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardPassenger}>
                    {booking.profiles.username}
                  </Text>
                  <StatusBadge status={booking.status} />
                </View>
                <Text style={styles.cardRoute} numberOfLines={1}>
                  {booking.routes.origin_address}
                </Text>
                <Text style={styles.cardArrow}>↓</Text>
                <Text style={styles.cardRoute} numberOfLines={1}>
                  {booking.routes.destination_address}
                </Text>
                <Text style={styles.cardMeta}>
                  Departure: {formatTime(booking.routes.departure_time)}
                </Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.acceptBtn,
                      respondingId === booking.id && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleRespond(booking.id, 'confirmed')}
                    disabled={respondingId === booking.id}
                    activeOpacity={0.7}
                  >
                    {respondingId === booking.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.declineBtn,
                      respondingId === booking.id && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleRespond(booking.id, 'declined')}
                    disabled={respondingId === booking.id}
                    activeOpacity={0.7}
                  >
                    {respondingId === booking.id ? (
                      <ActivityIndicator size="small" color="#991b1b" />
                    ) : (
                      <Text style={[styles.actionBtnText, styles.declineBtnText]}>Decline</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },

  // Segment control
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  segmentTextActive: { color: '#1a1a1a', fontWeight: '600' },

  // Loading
  centered: { paddingVertical: 40, alignItems: 'center' },

  // Error
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 14, marginBottom: 16 },
  errorText: { color: '#991b1b', fontSize: 14 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardRoute: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', flex: 1, marginRight: 8 },
  cardArrow: { fontSize: 13, color: '#9ca3af', marginVertical: 2 },
  cardPassenger: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 4 },

  // Status badge
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // Action buttons (driver)
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  acceptBtn: { backgroundColor: '#2563eb' },
  declineBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  actionBtnText: { fontWeight: '600', fontSize: 14, color: '#fff' },
  declineBtnText: { color: '#ef4444' },
});
