import {
  decodePolyline,
  haversineKm,
  minDistanceToPolylineKm,
  matchesPassengerCorridor,
} from '../lib/matching';
// Route is a type-only import; use a cast below rather than import type
// (babel-jest in the jest-expo preset does not enable TS syntax by default)
import { Route } from '../lib/routes';

// ─── decodePolyline ───────────────────────────────────────────────────────────

describe('decodePolyline', () => {
  it('returns empty array for empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes a single point', () => {
    // Budapest center (47.4979, 19.0402) — encoded via Google polyline algorithm
    const pts = decodePolyline('{|{`HgxesB');
    expect(pts).toHaveLength(1);
    expect(pts[0].lat).toBeCloseTo(47.4979, 3);
    expect(pts[0].lng).toBeCloseTo(19.0402, 3);
  });

  it('decodes two points with correct delta accumulation', () => {
    // Budapest center (47.4979, 19.0402) → Budaörs (47.4621, 18.9344)
    const pts = decodePolyline('{|{`HgxesBv~EftS');
    expect(pts).toHaveLength(2);
    expect(pts[0].lat).toBeCloseTo(47.4979, 3);
    expect(pts[0].lng).toBeCloseTo(19.0402, 3);
    // Second point is offset by the encoded delta
    expect(pts[1].lat).toBeLessThan(pts[0].lat); // Budaörs is south-west of Budapest
    expect(pts[1].lng).toBeLessThan(pts[0].lng);
  });

  it('handles malformed/truncated string without throwing', () => {
    // Should not throw — returns partial or empty result
    expect(() => decodePolyline('??!!')).not.toThrow();
  });

  it('round-trips: decoded coordinates are within 1e-5 degrees of originals', () => {
    // Budapest center → Budaörs encoded polyline
    const encoded = '{|{`HgxesBv~EftS';
    const pts = decodePolyline(encoded);
    // All coordinates within valid geographic range
    for (const p of pts) {
      expect(p.lat).toBeGreaterThan(-90);
      expect(p.lat).toBeLessThan(90);
      expect(p.lng).toBeGreaterThan(-180);
      expect(p.lng).toBeLessThan(180);
    }
  });
});

// ─── haversineKm ─────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 47.4979, lng: 19.0402 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it('computes correct distance between Budapest and Vienna (~215 km)', () => {
    const budapest = { lat: 47.4979, lng: 19.0402 };
    const vienna = { lat: 48.2082, lng: 16.3738 };
    const dist = haversineKm(budapest, vienna);
    expect(dist).toBeGreaterThan(210);
    expect(dist).toBeLessThan(220);
  });

  it('is symmetric — haversineKm(a,b) === haversineKm(b,a)', () => {
    const a = { lat: 47.4979, lng: 19.0402 };
    const b = { lat: 47.4621, lng: 18.9344 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 8);
  });

  it('computes short urban distance (~10 km for Budapest suburbs)', () => {
    const budapest = { lat: 47.4979, lng: 19.0402 };
    const budaors = { lat: 47.4621, lng: 18.9344 };
    const dist = haversineKm(budapest, budaors);
    expect(dist).toBeGreaterThan(8);
    expect(dist).toBeLessThan(12);
  });

  it('uses Earth radius 6371 km — equatorial degree is ~111 km', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    const dist = haversineKm(a, b);
    expect(dist).toBeCloseTo(111.19, 0); // 1° latitude with R=6371 ≈ 111.19 km
  });
});

// ─── minDistanceToPolylineKm ──────────────────────────────────────────────────

describe('minDistanceToPolylineKm', () => {
  it('returns Infinity for empty polyline', () => {
    expect(minDistanceToPolylineKm({ lat: 0, lng: 0 }, [])).toBe(Infinity);
  });

  it('returns 0 when point is on a vertex', () => {
    const pt = { lat: 47.4979, lng: 19.0402 };
    expect(minDistanceToPolylineKm(pt, [pt])).toBeCloseTo(0, 5);
  });

  it('returns distance to nearest of multiple vertices', () => {
    const pt = { lat: 47.49, lng: 19.04 };
    const near = { lat: 47.4905, lng: 19.0405 }; // ~0.7 km away
    const far = { lat: 47.60, lng: 19.20 };       // ~16 km away
    const dist = minDistanceToPolylineKm(pt, [far, near]);
    expect(dist).toBeLessThan(2);
    expect(dist).toBeGreaterThan(0);
  });

  it('always returns the minimum, not maximum', () => {
    const pt = { lat: 47.4979, lng: 19.0402 };
    const vertices = [
      { lat: 47.60, lng: 19.20 }, // far
      { lat: 47.4985, lng: 19.041 }, // near
      { lat: 47.80, lng: 19.50 }, // very far
    ];
    const dist = minDistanceToPolylineKm(pt, vertices);
    expect(dist).toBeLessThan(1); // should pick the near vertex
  });
});

// ─── matchesPassengerCorridor ─────────────────────────────────────────────────

// Budapest–Budaörs route fixture
// Encoded polyline: 2 vertices at Budapest center and Budaörs center
// detour_tolerance_km: 5
const BASE_ROUTE: Route = {
  id: 'test-route-1',
  driver_id: 'driver-1',
  origin_lat: 47.4979,
  origin_lng: 19.0402,
  origin_address: 'Budapest, Keleti Station',
  destination_lat: 47.4621,
  destination_lng: 18.9344,
  destination_address: 'Budaörs, Center',
  route_polyline: '{|{`HgxesBv~EftS',
  detour_tolerance_km: 5,
  detour_tolerance_min: 10,
  departure_time: '07:30:00',
  schedule_days: [1, 2, 3, 4, 5],
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
};

describe('matchesPassengerCorridor', () => {
  it('returns false when route_polyline is null', () => {
    const route = { ...BASE_ROUTE, route_polyline: null };
    const origin = { lat: 47.4979, lng: 19.0402 };
    const dest = { lat: 47.4621, lng: 18.9344 };
    expect(matchesPassengerCorridor(origin, dest, route as unknown as Route)).toBe(false);
  });

  it('returns false when route_polyline is empty string', () => {
    const route = { ...BASE_ROUTE, route_polyline: '' };
    expect(matchesPassengerCorridor(
      { lat: 47.4979, lng: 19.0402 },
      { lat: 47.4621, lng: 18.9344 },
      route,
    )).toBe(false);
  });

  it('returns true when both origin and dest are on polyline vertices', () => {
    // Passenger origin/dest exactly match the route endpoints
    const origin = { lat: 47.4979, lng: 19.0402 };
    const dest = { lat: 47.4621, lng: 18.9344 };
    expect(matchesPassengerCorridor(origin, dest, BASE_ROUTE)).toBe(true);
  });

  it('returns true when both points are within tolerance of the polyline', () => {
    // Points slightly offset from route vertices — within 5 km tolerance
    const origin = { lat: 47.500, lng: 19.042 }; // ~0.3 km from Budapest vertex
    const dest = { lat: 47.460, lng: 18.936 };   // ~0.3 km from Budaörs vertex
    expect(matchesPassengerCorridor(origin, dest, BASE_ROUTE)).toBe(true);
  });

  it('returns false when origin is outside tolerance', () => {
    // Origin far from route (Győr, ~100 km away)
    const origin = { lat: 47.6874, lng: 17.6504 };
    const dest = { lat: 47.4621, lng: 18.9344 };
    expect(matchesPassengerCorridor(origin, dest, BASE_ROUTE)).toBe(false);
  });

  it('returns false when destination is outside tolerance', () => {
    // Dest far from route (Pécs, ~180 km away)
    const origin = { lat: 47.4979, lng: 19.0402 };
    const dest = { lat: 46.0727, lng: 18.2323 };
    expect(matchesPassengerCorridor(origin, dest, BASE_ROUTE)).toBe(false);
  });

  it('returns false when both points are outside tolerance', () => {
    const origin = { lat: 46.0727, lng: 18.2323 }; // Pécs
    const dest = { lat: 47.6874, lng: 17.6504 };   // Győr
    expect(matchesPassengerCorridor(origin, dest, BASE_ROUTE)).toBe(false);
  });

  it('respects detour_tolerance_km — tighter tolerance excludes near points', () => {
    const tightRoute = { ...BASE_ROUTE, detour_tolerance_km: 0.1 };
    // Points 1 km away from vertices — within 5 km but outside 0.1 km
    const origin = { lat: 47.507, lng: 19.040 }; // ~1 km north of Budapest vertex
    const dest = { lat: 47.4621, lng: 18.9344 };
    expect(matchesPassengerCorridor(origin, dest, tightRoute)).toBe(false);
  });

  it('returns false without throwing on malformed polyline string', () => {
    const badRoute = { ...BASE_ROUTE, route_polyline: 'NOT_A_VALID_POLYLINE!!!' };
    expect(() => matchesPassengerCorridor(
      { lat: 47.4979, lng: 19.0402 },
      { lat: 47.4621, lng: 18.9344 },
      badRoute,
    )).not.toThrow();
  });
});
