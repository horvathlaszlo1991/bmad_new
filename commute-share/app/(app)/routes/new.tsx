import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { createRoute, fetchRouteDetails, type LatLng } from '@/lib/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaceSuggestion = {
  placeId: string;
  description: string;
};

type ResolvedPlace = {
  address: string;
  lat: number;
  lng: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DETOUR_KM_OPTIONS = [1, 2, 5, 10, 20];

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
];

const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5]; // Mon–Fri

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

async function fetchSuggestions(input: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const url =
    `${PLACES_BASE}/autocomplete/json?input=${encodeURIComponent(input)}` +
    `&types=geocode&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  type AutocompleteResponse = {
    status: string;
    predictions: Array<{ place_id: string; description: string }>;
  };

  const json: AutocompleteResponse = await res.json();
  if (json.status !== 'OK') return [];

  return json.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
  }));
}

async function resolvePlace(placeId: string): Promise<LatLng> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const url =
    `${PLACES_BASE}/details/json?place_id=${encodeURIComponent(placeId)}` +
    `&fields=geometry&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Place Details HTTP error: ${res.status}`);

  type PlaceDetailsResponse = {
    status: string;
    result: { geometry: { location: { lat: number; lng: number } } };
  };

  const json: PlaceDetailsResponse = await res.json();
  if (json.status !== 'OK') throw new Error(`Place Details status: ${json.status}`);

  const { lat, lng } = json.result.geometry.location;
  return { lat, lng };
}

// ─── Sub-component: AddressInput ─────────────────────────────────────────────

type AddressInputProps = {
  label: string;
  value: string;
  resolved: boolean;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  onChange: (text: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
};

function AddressInput({
  label,
  value,
  resolved,
  suggestions,
  loading,
  onChange,
  onSelect,
}: AddressInputProps) {
  return (
    <View style={addrStyles.wrapper}>
      <Text style={addrStyles.label}>{label}</Text>
      <View style={[addrStyles.inputRow, resolved && addrStyles.inputRowResolved]}>
        <TextInput
          style={addrStyles.input}
          value={value}
          onChangeText={onChange}
          placeholder="Search address…"
          placeholderTextColor="#9ca3af"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          editable={!resolved}
          selectTextOnFocus
        />
        {loading && <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 10 }} />}
        {resolved && (
          <Pressable onPress={() => onChange('')} accessibilityLabel={`Clear ${label}`}>
            <Text style={addrStyles.clearBtn}>✕</Text>
          </Pressable>
        )}
      </View>
      {suggestions.length > 0 && !resolved && (
        <View style={addrStyles.dropdown}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s.placeId}
              style={addrStyles.dropdownItem}
              onPress={() => onSelect(s)}
              activeOpacity={0.7}
            >
              <Text style={addrStyles.dropdownText} numberOfLines={2}>
                {s.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {suggestions.length === 0 && !resolved && !loading && value.length >= 3 && (
        <Text style={addrStyles.noResults}>No results</Text>
      )}
    </View>
  );
}

const addrStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  inputRowResolved: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  input: { flex: 1, fontSize: 15, color: '#1a1a1a', paddingVertical: 12 },
  clearBtn: { fontSize: 16, color: '#9ca3af', paddingHorizontal: 8, paddingVertical: 4 },
  dropdown: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownText: { fontSize: 14, color: '#1a1a1a' },
  noResults: { fontSize: 13, color: '#9ca3af', paddingHorizontal: 4, paddingTop: 6 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NewRoute() {
  const router = useRouter();

  // ── Address autocomplete state ───────────────────────────────────────────
  const [originText, setOriginText] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [originPlace, setOriginPlace] = useState<ResolvedPlace | null>(null);

  const [destText, setDestText] = useState('');
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destLoading, setDestLoading] = useState(false);
  const [destPlace, setDestPlace] = useState<ResolvedPlace | null>(null);

  // ── Route details state ──────────────────────────────────────────────────
  const [polyline, setPolyline] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // ── Form state ───────────────────────────────────────────────────────────
  const [detourKm, setDetourKm] = useState(5);
  const [detourMin, setDetourMin] = useState(10);
  const [departureTime, setDepartureTime] = useState('07:30');
  const [scheduleDays, setScheduleDays] = useState<number[]>([...DEFAULT_SCHEDULE]);

  // ── Save state ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Debounce timers ──────────────────────────────────────────────────────
  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stale request counters ────────────────────────────────────────────────
  const originReqId = useRef(0);
  const destReqId = useRef(0);

  // ── Autocomplete handlers ────────────────────────────────────────────────

  const handleOriginChange = useCallback((text: string) => {
    setOriginText(text);
    setOriginPlace(null);
    setOriginSuggestions([]);
    setPolyline(null);
    setRouteError(null);

    if (originTimer.current) clearTimeout(originTimer.current);
    if (text.length < 3) return;

    originTimer.current = setTimeout(async () => {
      originReqId.current += 1;
      const reqId = originReqId.current;
      setOriginLoading(true);
      try {
        const results = await fetchSuggestions(text);
        if (reqId !== originReqId.current) return; // stale
        setOriginSuggestions(results);
      } finally {
        setOriginLoading(false);
      }
    }, 400);
  }, []);

  const handleDestChange = useCallback((text: string) => {
    setDestText(text);
    setDestPlace(null);
    setDestSuggestions([]);
    setPolyline(null);
    setRouteError(null);

    if (destTimer.current) clearTimeout(destTimer.current);
    if (text.length < 3) return;

    destTimer.current = setTimeout(async () => {
      destReqId.current += 1;
      const reqId = destReqId.current;
      setDestLoading(true);
      try {
        const results = await fetchSuggestions(text);
        if (reqId !== destReqId.current) return; // stale
        setDestSuggestions(results);
      } finally {
        setDestLoading(false);
      }
    }, 400);
  }, []);

  const handleOriginSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setOriginLoading(true);
    try {
      const { lat, lng } = await resolvePlace(suggestion.placeId);
      setOriginSuggestions([]);           // clear only on success
      setOriginText(suggestion.description);
      setOriginPlace({ address: suggestion.description, lat, lng });
    } catch {
      // resolvePlace failed — keep suggestions visible so user can retry
    } finally {
      setOriginLoading(false);
    }
  }, []);

  const handleDestSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setDestLoading(true);
    try {
      const { lat, lng } = await resolvePlace(suggestion.placeId);
      setDestSuggestions([]);           // clear only on success
      setDestText(suggestion.description);
      setDestPlace({ address: suggestion.description, lat, lng });
    } catch {
      // resolvePlace failed — keep suggestions visible so user can retry
    } finally {
      setDestLoading(false);
    }
  }, []);

  // ── Fetch route once both ends are resolved ──────────────────────────────

  useEffect(() => {
    if (!originPlace || !destPlace) return;

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    setPolyline(null);

    const origin: LatLng = { lat: originPlace.lat, lng: originPlace.lng };
    const dest: LatLng = { lat: destPlace.lat, lng: destPlace.lng };

    fetchRouteDetails(origin, dest)
      .then(({ polyline: poly, durationMin }) => {
        if (cancelled) return;
        setPolyline(poly);
        const defaultDetour = Math.max(1, Math.round(durationMin * 0.2));
        setDetourMin(defaultDetour);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setRouteError(err.message || 'Could not fetch route details');
        setDetourMin(10); // fallback
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => { cancelled = true; };
  }, [originPlace, destPlace]);

  // ── Toggle schedule day ──────────────────────────────────────────────────

  const toggleDay = useCallback((day: number) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────

  const canSave =
    originPlace !== null &&
    destPlace !== null &&
    polyline !== null &&
    polyline !== '' &&
    scheduleDays.length > 0 &&
    HH_MM_RE.test(departureTime) &&
    !routeLoading &&
    !saving;

  async function handleSave() {
    if (!canSave || !originPlace || !destPlace || !polyline) return;

    setSaving(true);
    setSaveError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      // Ensure time is "HH:MM:SS" format for Postgres time column
      const timeForDb = departureTime.length === 5 ? `${departureTime}:00` : departureTime;

      await createRoute({
        driver_id: user.id,
        origin_address: originPlace.address,
        origin_lat: originPlace.lat,
        origin_lng: originPlace.lng,
        destination_address: destPlace.address,
        destination_lat: destPlace.lat,
        destination_lng: destPlace.lng,
        route_polyline: polyline,
        detour_tolerance_km: detourKm,
        detour_tolerance_min: detourMin,
        departure_time: timeForDb,
        schedule_days: scheduleDays,
        status: 'active',
      });

      router.replace('/(app)/routes');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save route');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Lazy-load MapView on native only to avoid web crash
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let MapView: React.ComponentType<any> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Polyline: React.ComponentType<any> | null = null;

  if (Platform.OS !== 'web') {
    // require() at call-time is intentional — keeps web bundle clean
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNMaps = require('react-native-maps');
    MapView = RNMaps.default;
    Polyline = RNMaps.Polyline;
  }

  const showMap =
    Platform.OS !== 'web' &&
    MapView !== null &&
    Polyline !== null &&
    originPlace !== null &&
    destPlace !== null &&
    polyline !== null &&
    polyline !== '';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>New Route</Text>

      {/* ── Step 1: Origin ── */}
      <Text style={styles.sectionLabel}>Step 1 — Origin</Text>
      <AddressInput
        label="Starting point"
        value={originText}
        resolved={originPlace !== null}
        suggestions={originSuggestions}
        loading={originLoading}
        onChange={handleOriginChange}
        onSelect={handleOriginSelect}
      />

      {/* ── Step 2: Destination ── */}
      <Text style={styles.sectionLabel}>Step 2 — Destination</Text>
      <AddressInput
        label="End point"
        value={destText}
        resolved={destPlace !== null}
        suggestions={destSuggestions}
        loading={destLoading}
        onChange={handleDestChange}
        onSelect={handleDestSelect}
      />

      {/* ── Step 3: Map preview / route fetch ── */}
      {(originPlace && destPlace) && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Step 3 — Route Preview</Text>

          {routeLoading && (
            <View style={styles.mapPlaceholder}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.mapPlaceholderText}>Fetching route…</Text>
            </View>
          )}

          {routeError && !routeLoading && (
            <View style={styles.routeErrorBox}>
              <Text style={styles.routeErrorText}>{routeError}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  if (originPlace && destPlace) {
                    setRouteError(null);
                    setRouteLoading(true);
                    fetchRouteDetails(
                      { lat: originPlace.lat, lng: originPlace.lng },
                      { lat: destPlace.lat, lng: destPlace.lng },
                    )
                      .then(({ polyline: poly, durationMin }) => {
                        setPolyline(poly);
                        setDetourMin(Math.max(1, Math.round(durationMin * 0.2)));
                      })
                      .catch((e: Error) => { setRouteError(e.message); setDetourMin(10); })
                      .finally(() => setRouteLoading(false));
                  }
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {showMap && MapView && Polyline && originPlace && destPlace && (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: (originPlace.lat + destPlace.lat) / 2,
                longitude: (originPlace.lng + destPlace.lng) / 2,
                latitudeDelta: Math.abs(originPlace.lat - destPlace.lat) * 2 + 0.05,
                longitudeDelta: Math.abs(originPlace.lng - destPlace.lng) * 2 + 0.05,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline
                coordinates={decodePolyline(polyline ?? '')}
                strokeColor="#2563eb"
                strokeWidth={3}
              />
            </MapView>
          )}

          {!showMap && !routeLoading && !routeError && originPlace && destPlace && polyline && (
            <View style={styles.webMapFallback}>
              <Text style={styles.webMapText}>
                {originPlace.address}
              </Text>
              <Text style={styles.webMapArrow}>↓</Text>
              <Text style={styles.webMapText}>
                {destPlace.address}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Step 4: Tolerances ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Step 4 — Detour Tolerance</Text>

        <Text style={styles.fieldLabel}>Max detour distance</Text>
        <View style={styles.chipRow}>
          {DETOUR_KM_OPTIONS.map((km) => (
            <Pressable
              key={km}
              style={[styles.chip, detourKm === km && styles.chipActive]}
              onPress={() => setDetourKm(km)}
              accessibilityRole="radio"
              accessibilityState={{ selected: detourKm === km }}
            >
              <Text style={[styles.chipText, detourKm === km && styles.chipTextActive]}>
                {km} km
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Max detour time (minutes)</Text>
        <View style={styles.stepperRow}>
          <Pressable
            style={styles.stepperButton}
            onPress={() => setDetourMin((v) => Math.max(1, v - 1))}
            accessibilityLabel="Decrease detour minutes"
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{detourMin}</Text>
          <Pressable
            style={styles.stepperButton}
            onPress={() => setDetourMin((v) => Math.min(60, v + 1))}
            accessibilityLabel="Increase detour minutes"
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Step 5: Schedule ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Step 5 — Schedule</Text>

        <Text style={styles.fieldLabel}>Departure time (HH:MM)</Text>
        <TextInput
          style={styles.timeInput}
          value={departureTime}
          onChangeText={setDepartureTime}
          placeholder="07:30"
          placeholderTextColor="#9ca3af"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          returnKeyType="done"
        />
        {departureTime.length > 0 && !HH_MM_RE.test(departureTime) && (
          <Text style={styles.fieldError}>Enter time as HH:MM (e.g. 07:30)</Text>
        )}

        <Text style={styles.fieldLabel}>Days of week</Text>
        <View style={styles.daysRow}>
          {DAYS.map((day) => {
            const active = scheduleDays.includes(day.value);
            return (
              <Pressable
                key={day.value}
                style={[styles.dayChip, active && styles.dayChipActive]}
                onPress={() => toggleDay(day.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
              >
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                  {day.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Save ── */}
      {saveError && (
        <Text style={styles.saveError}>{saveError}</Text>
      )}

      <Pressable
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityLabel="Save Route"
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Route</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ─── Polyline decoder ────────────────────────────────────────────────────────
// Decodes a Google Maps encoded polyline string into an array of lat/lng coords.

type Coordinate = { latitude: number; longitude: number };

function decodePolyline(encoded: string): Coordinate[] {
  const result: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result2 = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result2 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result2 & 1 ? ~(result2 >> 1) : result2 >> 1;
    lat += dlat;

    shift = 0;
    result2 = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result2 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result2 & 1 ? ~(result2 >> 1) : result2 >> 1;
    lng += dlng;

    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return result;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },

  section: { marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },

  // Map
  map: { width: '100%', height: 200, borderRadius: 10, marginBottom: 4 },
  mapPlaceholder: { height: 120, borderRadius: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapPlaceholderText: { color: '#6b7280', fontSize: 14 },
  webMapFallback: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 16, marginBottom: 4 },
  webMapText: { fontSize: 14, color: '#1e40af', fontWeight: '600' },
  webMapArrow: { fontSize: 18, color: '#93c5fd', marginVertical: 4 },

  // Route error
  routeErrorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 14, marginBottom: 4 },
  routeErrorText: { color: '#991b1b', fontSize: 14, marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#ef4444', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  retryButtonText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

  // Detour km chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#2563eb', fontWeight: '600' },

  // Detour min stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontSize: 22, color: '#2563eb', lineHeight: 26 },
  stepperValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', minWidth: 32, textAlign: 'center' },

  // Time input
  timeInput: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#1a1a1a',
    backgroundColor: '#fff',
    width: 120,
  },

  // Day chips
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 48, alignItems: 'center' },
  dayChipActive: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  dayChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  dayChipTextActive: { color: '#fff' },

  // Save
  saveButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  saveError: { color: '#e53e3e', fontSize: 14, textAlign: 'center', marginTop: 12 },
  fieldError: { fontSize: 12, color: '#e53e3e', marginTop: 4 },
});
