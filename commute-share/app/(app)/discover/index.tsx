import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { getActiveRoutesForDiscovery, type LatLng, type Route } from '@/lib/routes';
import { matchesPassengerCorridor } from '@/lib/matching';

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

const DAY_LABELS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchSuggestions(input: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({ input, includedPrimaryTypes: ['geocode'] }),
  });

  if (!res.ok) return [];

  type AutocompleteResponse = {
    suggestions?: Array<{
      placePrediction: { placeId: string; text: { text: string } };
    }>;
  };

  const json: AutocompleteResponse = await res.json();
  return (json.suggestions ?? []).map((s) => ({
    placeId: s.placePrediction.placeId,
    description: s.placePrediction.text.text,
  }));
}

async function resolvePlace(placeId: string): Promise<LatLng> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'location',
      },
    },
  );

  if (!res.ok) throw new Error(`Place Details HTTP error: ${res.status}`);

  type PlaceDetailsResponse = {
    location: { latitude: number; longitude: number };
  };

  const json: PlaceDetailsResponse = await res.json();
  return { lat: json.location.latitude, lng: json.location.longitude };
}

function daysLabel(days: number[]): string {
  return days.map((d) => DAY_LABELS[d - 1]).join(' ');
}

function formatTime(time: string): string {
  // "HH:MM:SS" → "HH:MM"
  return time.slice(0, 5);
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

type SearchState = 'idle' | 'loading' | 'error' | 'done';

export default function DiscoverScreen() {
  // ── Address autocomplete state ───────────────────────────────────────────
  const [originText, setOriginText] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [originPlace, setOriginPlace] = useState<ResolvedPlace | null>(null);

  const [destText, setDestText] = useState('');
  const [destSuggestions, setDestSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destLoading, setDestLoading] = useState(false);
  const [destPlace, setDestPlace] = useState<ResolvedPlace | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Route[]>([]);

  // ── Debounce timers ──────────────────────────────────────────────────────
  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stale request counters ────────────────────────────────────────────────
  const originReqId = useRef(0);
  const destReqId = useRef(0);
  const searchReqId = useRef(0);

  // ── Autocomplete handlers ────────────────────────────────────────────────

  const handleOriginChange = useCallback((text: string) => {
    setOriginText(text);
    setOriginPlace(null);
    setOriginSuggestions([]);

    if (originTimer.current) clearTimeout(originTimer.current);
    if (text.length < 3) return;

    originTimer.current = setTimeout(async () => {
      originReqId.current += 1;
      const reqId = originReqId.current;
      setOriginLoading(true);
      try {
        const suggestions = await fetchSuggestions(text);
        if (reqId !== originReqId.current) return; // stale
        setOriginSuggestions(suggestions);
      } catch {
        setOriginSuggestions([]);
      } finally {
        setOriginLoading(false);
      }
    }, 400);
  }, []);

  const handleDestChange = useCallback((text: string) => {
    setDestText(text);
    setDestPlace(null);
    setDestSuggestions([]);

    if (destTimer.current) clearTimeout(destTimer.current);
    if (text.length < 3) return;

    destTimer.current = setTimeout(async () => {
      destReqId.current += 1;
      const reqId = destReqId.current;
      setDestLoading(true);
      try {
        const suggestions = await fetchSuggestions(text);
        if (reqId !== destReqId.current) return; // stale
        setDestSuggestions(suggestions);
      } catch {
        setDestSuggestions([]);
      } finally {
        setDestLoading(false);
      }
    }, 400);
  }, []);

  const handleOriginSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setOriginLoading(true);
    try {
      const { lat, lng } = await resolvePlace(suggestion.placeId);
      setOriginSuggestions([]);
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
      setDestSuggestions([]);
      setDestText(suggestion.description);
      setDestPlace({ address: suggestion.description, lat, lng });
    } catch {
      // resolvePlace failed — keep suggestions visible so user can retry
    } finally {
      setDestLoading(false);
    }
  }, []);

  // ── Search handler ────────────────────────────────────────────────────────

  const canSearch = originPlace !== null && destPlace !== null && searchState !== 'loading';

  async function handleSearch() {
    if (!originPlace || !destPlace) return;

    searchReqId.current += 1;
    const reqId = searchReqId.current;

    setSearchState('loading');
    setSearchError(null);
    setResults([]);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const allRoutes = await getActiveRoutesForDiscovery(user.id);

      if (reqId !== searchReqId.current) return; // stale

      const origin: LatLng = { lat: originPlace.lat, lng: originPlace.lng };
      const dest: LatLng = { lat: destPlace.lat, lng: destPlace.lng };

      const matched = allRoutes.filter((route) =>
        matchesPassengerCorridor(origin, dest, route),
      );

      setResults(matched);
      setSearchState('done');
    } catch (err) {
      if (reqId !== searchReqId.current) return; // stale
      setSearchError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setSearchState('error');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Find Rides</Text>
      <Text style={styles.subheading}>
        Enter your origin and destination to find matching driver routes.
      </Text>

      <AddressInput
        label="Your origin"
        value={originText}
        resolved={originPlace !== null}
        suggestions={originSuggestions}
        loading={originLoading}
        onChange={handleOriginChange}
        onSelect={handleOriginSelect}
      />

      <AddressInput
        label="Your destination"
        value={destText}
        resolved={destPlace !== null}
        suggestions={destSuggestions}
        loading={destLoading}
        onChange={handleDestChange}
        onSelect={handleDestSelect}
      />

      <Pressable
        style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
        onPress={handleSearch}
        disabled={!canSearch}
        accessibilityRole="button"
        accessibilityLabel="Search for rides"
      >
        {searchState === 'loading' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.searchButtonText}>Search</Text>
        )}
      </Pressable>

      {/* ── Results area ── */}
      {searchState === 'error' && searchError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{searchError}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={handleSearch}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {searchState === 'done' && results.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No rides found for this route</Text>
          <Text style={styles.emptySubtitle}>
            Try adjusting your origin or destination, or check back later.
          </Text>
        </View>
      )}

      {searchState === 'done' && results.length > 0 && (
        <View style={styles.resultsList}>
          <Text style={styles.resultsHeader}>
            {results.length} ride{results.length !== 1 ? 's' : ''} found
          </Text>
          {results.map((route) => (
            <View key={route.id} style={styles.card}>
              <Text style={styles.cardOrigin} numberOfLines={1}>
                {route.origin_address}
              </Text>
              <Text style={styles.cardArrow}>↓</Text>
              <Text style={styles.cardDest} numberOfLines={1}>
                {route.destination_address}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>{daysLabel(route.schedule_days)}</Text>
                <Text style={styles.metaDivider}>·</Text>
                <Text style={styles.metaText}>{formatTime(route.departure_time)}</Text>
                <Text style={styles.metaDivider}>·</Text>
                <Text style={styles.metaText}>±{route.detour_tolerance_km} km</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 24 },

  // Search button
  searchButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  searchButtonDisabled: { opacity: 0.45 },
  searchButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Error
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 14, marginBottom: 16 },
  errorText: { color: '#991b1b', fontSize: 14, marginBottom: 8 },
  retryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryButtonText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center' },

  // Results
  resultsList: { gap: 12 },
  resultsHeader: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

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
  cardOrigin: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  cardArrow: { fontSize: 14, color: '#9ca3af', marginVertical: 2 },
  cardDest: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  metaText: { fontSize: 13, color: '#6b7280' },
  metaDivider: { marginHorizontal: 6, color: '#d1d5db' },
});
