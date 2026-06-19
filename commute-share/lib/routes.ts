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

export type RouteWithDriver = Route & {
  profiles: { username: string };
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

export async function getActiveRoutesForDiscovery(userId: string): Promise<RouteWithDriver[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*, profiles!driver_id(username)')
    .eq('status', 'active')
    .neq('driver_id', userId);

  if (error) throw new Error(error.message);
  return (data ?? []) as RouteWithDriver[];
}

export async function deleteRoute(routeId: string): Promise<void> {
  const { error } = await supabase
    .from('routes')
    .update({ status: 'deleted' })
    .eq('id', routeId);

  if (error) throw new Error(error.message);
}

// ─── Google Routes API (New) ──────────────────────────────────────────────────

type RouteDetails = {
  polyline: string;
  durationMin: number;
};

export async function fetchRouteDetails(
  origin: LatLng,
  dest: LatLng,
): Promise<RouteDetails> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.polyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: 'DRIVE',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Routes API ${res.status}: ${body}`);
  }

  type RoutesResponse = {
    routes: Array<{
      duration: string; // e.g. "1234s"
      polyline: { encodedPolyline: string };
    }>;
  };

  const json: RoutesResponse = await res.json();

  if (!json.routes?.length) {
    throw new Error('Routes API returned no routes');
  }

  const route = json.routes[0];
  const polyline = route.polyline.encodedPolyline;
  const durationMin = Math.round(parseInt(route.duration, 10) / 60);

  return { polyline, durationMin };
}
