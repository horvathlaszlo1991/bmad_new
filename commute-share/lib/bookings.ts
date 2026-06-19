import { supabase } from './supabase';
import type { RouteWithDriver } from './routes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled';

export type Booking = {
  id: string;
  route_id: string;
  driver_id: string;
  passenger_id: string;
  status: BookingStatus;
  requested_at: string;
  confirmed_at: string | null;
  passenger_note: string | null;
};

export type BookingWithDetails = Booking & {
  routes: {
    origin_address: string;
    destination_address: string;
    departure_time: string;
  };
  profiles: {
    username: string;
  };
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function validateBookingRequest(
  userId: string,
  route: RouteWithDriver,
): { valid: boolean; reason?: string } {
  if (userId === route.driver_id) {
    return { valid: false, reason: 'You cannot book your own route.' };
  }
  if (route.status !== 'active') {
    return { valid: false, reason: 'This route is not currently active.' };
  }
  return { valid: true };
}

// ─── Async CRUD ───────────────────────────────────────────────────────────────

export async function createBookingRequest(
  routeId: string,
  driverId: string,
): Promise<{ data: Booking | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'Not authenticated.' };
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      route_id: routeId,
      driver_id: driverId,
      passenger_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Booking, error: null };
}

export async function getMyBookingsAsPassenger(
  userId: string,
): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      '*, routes(origin_address, destination_address, departure_time), profiles!driver_id(username)',
    )
    .eq('passenger_id', userId)
    .order('requested_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as BookingWithDetails[];
}

export async function getPendingRequestsForDriver(
  userId: string,
): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      '*, profiles!passenger_id(username), routes(origin_address, destination_address, departure_time)',
    )
    .eq('driver_id', userId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BookingWithDetails[];
}

export async function respondToBooking(
  bookingId: string,
  status: 'confirmed' | 'declined',
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .eq('status', 'pending');

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
