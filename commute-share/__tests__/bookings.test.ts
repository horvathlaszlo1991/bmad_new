// Mock the Supabase client so the test runs in Node without native dependencies
jest.mock('../lib/supabase');

import { validateBookingRequest } from '../lib/bookings';
import type { RouteWithDriver } from '../lib/routes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ROUTE: RouteWithDriver = {
  id: 'route-1',
  driver_id: 'driver-user-id',
  origin_address: 'Budapest, Keleti Station',
  origin_lat: 47.4979,
  origin_lng: 19.0402,
  destination_address: 'Budaörs, Center',
  destination_lat: 47.4621,
  destination_lng: 18.9344,
  route_polyline: '{|{`HgxesBv~EftS',
  detour_tolerance_km: 5,
  detour_tolerance_min: 10,
  departure_time: '07:30:00',
  schedule_days: [1, 2, 3, 4, 5],
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  profiles: { username: 'driveruser' },
};

// ─── validateBookingRequest ───────────────────────────────────────────────────

describe('validateBookingRequest', () => {
  it('blocks booking when userId matches route.driver_id (own route)', () => {
    const result = validateBookingRequest('driver-user-id', BASE_ROUTE);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('blocks booking when route status is paused', () => {
    const pausedRoute: RouteWithDriver = { ...BASE_ROUTE, status: 'paused' };
    const result = validateBookingRequest('passenger-user-id', pausedRoute);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('blocks booking when route status is deleted', () => {
    const deletedRoute: RouteWithDriver = { ...BASE_ROUTE, status: 'deleted' };
    const result = validateBookingRequest('passenger-user-id', deletedRoute);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('allows booking when userId differs from driver_id and route is active', () => {
    const result = validateBookingRequest('passenger-user-id', BASE_ROUTE);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('own-route check takes priority over status check', () => {
    // Even if the route were paused, blocking own-route should come first.
    const pausedOwnRoute: RouteWithDriver = {
      ...BASE_ROUTE,
      driver_id: 'driver-user-id',
      status: 'paused',
    };
    const result = validateBookingRequest('driver-user-id', pausedOwnRoute);
    expect(result.valid).toBe(false);
  });

  it('does not mutate the route object', () => {
    const routeCopy = { ...BASE_ROUTE };
    validateBookingRequest('passenger-user-id', BASE_ROUTE);
    expect(BASE_ROUTE).toEqual(routeCopy);
  });
});
