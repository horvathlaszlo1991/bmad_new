import type { LatLng, Route } from './routes';

// ─── Polyline decoder ─────────────────────────────────────────────────────────
// Standard Google Encoded Polyline algorithm:
//   - Read bytes, subtract 63, accumulate 5-bit chunks (LSB first) until a byte
//     with bit-5 unset is found.
//   - Zigzag-decode: if bit 0 is set, negate; otherwise keep.
//   - Divide by 1e5 to get degrees.
//   - Delta-accumulate: each value is relative to the previous point.
//   - Lat and lng are encoded in sequence (lat first, then lng per point).

export function decodePolyline(encoded: string): LatLng[] {
  const result: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let value = 0;

    // Decode latitude delta
    do {
      b = encoded.charCodeAt(index++) - 63;
      value |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = value & 1 ? ~(value >> 1) : value >> 1;
    lat += dlat;

    shift = 0;
    value = 0;

    // Decode longitude delta
    do {
      b = encoded.charCodeAt(index++) - 63;
      value |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = value & 1 ? ~(value >> 1) : value >> 1;
    lng += dlng;

    result.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return result;
}

// ─── Haversine distance ───────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ─── Min distance from point to any polyline vertex ──────────────────────────

export function minDistanceToPolylineKm(point: LatLng, pts: LatLng[]): number {
  if (pts.length === 0) return Infinity;
  let min = Infinity;
  for (const vertex of pts) {
    const d = haversineKm(point, vertex);
    if (d < min) min = d;
  }
  return min;
}

// ─── Corridor match predicate ─────────────────────────────────────────────────
// Returns true when both the passenger's origin and destination are within
// route.detour_tolerance_km of the nearest vertex on the driver's route polyline.

export function matchesPassengerCorridor(
  origin: LatLng,
  dest: LatLng,
  route: Route,
): boolean {
  if (!route.route_polyline) return false;
  let pts: LatLng[];
  try {
    pts = decodePolyline(route.route_polyline);
  } catch {
    return false;
  }
  if (pts.length === 0) return false;
  const tolerance = route.detour_tolerance_km;
  return (
    minDistanceToPolylineKm(origin, pts) <= tolerance &&
    minDistanceToPolylineKm(dest, pts) <= tolerance
  );
}
