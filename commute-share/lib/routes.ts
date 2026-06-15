import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Route = {
  id: string;
  driver_id: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  route_polyline: string;
  detour_tolerance_km: number;
  detour_tolerance_min: number;
  departure_time: string; // "HH:MM:SS"
  schedule_days: number[]; // 1=Mon … 7=Sun
  status: 'active' | 'paused' | 'deleted';
  created_at: string;
};

export type RouteInsert = Omit<Route, 'id' | 'created_at'>;

export type LatLng = { lat: number; lng: number };

// ─── CRUD wrappers ────────────────────────────────────────────────────────────

export async function getMyRoutes(userId: string): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('driver_id', userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Route[];
}

export async function createRoute(payload: RouteInsert): Promise<Route> {
  const { data, error } = await supabase
    .from('routes')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Route;
}

export async function deleteRoute(routeId: string): Promise<void> {
  const { error } = await supabase
    .from('routes')
    .update({ status: 'deleted' })
    .eq('id', routeId);

  if (error) throw new Error(error.message);
}

// ─── Google Directions API ────────────────────────────────────────────────────

type RouteDetails = {
  polyline: string;
  durationMin: number;
};

export async function fetchRouteDetails(
  origin: LatLng,
  dest: LatLng,
): Promise<RouteDetails> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${origin.lat},${origin.lng}` +
    `&destination=${dest.lat},${dest.lng}` +
    `&mode=driving` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Directions API HTTP error: ${res.status}`);
  }

  type DirectionsResponse = {
    status: string;
    routes: Array<{
      overview_polyline: { points: string };
      legs: Array<{ duration: { value: number } }>;
    }>;
  };

  const json: DirectionsResponse = await res.json();

  if (json.status !== 'OK' || !json.routes.length) {
    throw new Error(`Directions API returned status: ${json.status}`);
  }

  if (!json.routes[0].legs?.length) {
    throw new Error('Directions API returned a route with no legs');
  }

  const route = json.routes[0];
  const polyline = route.overview_polyline.points;
  const durationMin = Math.round(route.legs[0].duration.value / 60);

  return { polyline, durationMin };
}
