import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Place = { id: string; name: string; lat: number; lng: number };
type Leg =
  | { kind: 'ride'; route_code: string; route_name: string; towards: string; ride_km: number; walk_to_m?: number; walk_after_m?: number }
  | { kind: 'walk' | 'tricycle'; distance_m: number };
type Option = { total_min: number; wait_min: number; wait_is_live: boolean; transfers: number; legs: Leg[] };

const WALK_M = 2000; // town centres can sit a little off the highway

// Trip planner: from the spot picked on the home map to a town along the routes.
export default function PlanScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState('');
  const [dest, setDest] = useState<Place | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('places_served')
      .select('id, name, lat, lng')
      .order('name')
      .then(({ data, error }) => (error ? setError('Could not load towns.') : setPlaces(data)));
  }, []);

  async function plan(p: Place) {
    if (!lat || !lng) return;
    setDest(p);
    setBusy(true);
    setError(null);
    setOptions(null);
    const { data, error } = await supabase.rpc('plan_trip', { o_lat: Number(lat), o_lng: Number(lng), d_lat: p.lat, d_lng: p.lng, p_walk_m: WALK_M });
    setBusy(false);
    if (error) setError('Could not plan the trip. Check your connection.');
    else setOptions(data);
  }

  if (!lat || !lng) {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>Pick where you are first: allow location, or long-press the map.</Text>
      </View>
    );
  }

  const shown = places.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Where to?</Text>
      <TextInput style={styles.input} placeholder="Search a town, e.g. Carmen" value={query} onChangeText={setQuery} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!dest || query ? (
        <View style={styles.list}>
          {shown.map((p) => (
            <Pressable
              key={p.id}
              style={styles.place}
              onPress={() => {
                setQuery('');
                plan(p);
              }}
              accessibilityRole="button">
              <Text style={styles.placeText}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {dest && !query ? (
        <>
          <Text style={styles.subtitle}>To {dest.name}</Text>
          {busy ? <ActivityIndicator color={colors.navy} /> : null}
          {options && options.length === 0 ? (
            <Text style={styles.body}>No route links your spot to {dest.name} yet. Try a spot closer to a highway.</Text>
          ) : null}
          {options?.map((o, n) => (
            <View key={n} style={[styles.option, n === 0 && styles.best]}>
              <View style={styles.optionHead}>
                <Text style={styles.total}>~{o.total_min} min</Text>
                <Text style={styles.tag}>{n === 0 ? 'Fastest' : o.transfers ? '1 transfer' : 'Direct'}</Text>
              </View>
              <Text style={styles.wait}>
                {o.wait_is_live ? `Next van in ~${Math.round(o.wait_min)} min (live)` : 'No live van yet, about 15 min wait assumed'}
              </Text>
              {o.legs.map((l, i) =>
                l.kind === 'ride' ? (
                  <Text key={i} style={styles.leg}>
                    {l.walk_to_m && l.walk_to_m > 50 ? `Walk ${l.walk_to_m} m to the road, then ride ` : 'Ride '}
                    <Text style={styles.bold}>{l.route_name}</Text> towards {l.towards} for {l.ride_km} km
                    {l.walk_after_m && l.walk_after_m > 50 ? `, then walk ${l.walk_after_m} m` : ''}
                  </Text>
                ) : (
                  <Text key={i} style={styles.leg}>
                    {l.kind === 'walk' ? `Walk ${l.distance_m} m to the next ride` : `Take a tricycle ${(l.distance_m / 1000).toFixed(1)} km to the next ride`}
                  </Text>
                ),
              )}
            </View>
          ))}
          <Text style={styles.note}>Times assume 30 km/h on the road. Live vans make the first wait exact.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, gap: 10, backgroundColor: colors.cream },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 8, fontSize: 18, fontWeight: '700', color: colors.navy },
  body: { fontSize: 15, color: colors.muted },
  error: { fontSize: 14, color: colors.orangeDark },
  input: { borderWidth: 1, borderColor: '#C9D1D9', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FFFDF8', color: colors.ink },
  list: { gap: 6 },
  place: { padding: 14, borderRadius: 10, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#D3D9DF' },
  placeText: { fontSize: 16, color: colors.navy },
  option: { padding: 14, borderRadius: 12, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#D3D9DF', gap: 6 },
  best: { borderColor: colors.orange, borderWidth: 2 },
  optionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: 22, fontWeight: '700', color: colors.navy },
  tag: { fontSize: 13, fontWeight: '600', color: colors.orangeDark },
  wait: { fontSize: 13, color: colors.muted },
  leg: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  bold: { fontWeight: '700' },
  note: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
