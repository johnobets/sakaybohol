import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { fetchHubs, fetchRouteLines, type Hub, type RouteLine } from '@/lib/routes';
import { SEAT_LABEL, type SeatStatus } from '@/lib/seats';
import { BOHOL_REGION, colors } from '@/lib/theme';
import { useLiveVehicles } from '@/lib/useLiveVehicles';

// Commuter home (Near Me): route lines, Dao terminal, and live vans with seats left.
export default function CommuterHome() {
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = useLiveVehicles(routes.map((r) => r.id));
  const colorOf = (routeId: string) => routes.find((r) => r.id === routeId)?.color ?? colors.navy;

  useEffect(() => {
    Promise.all([fetchRouteLines(), fetchHubs()])
      .then(([r, h]) => {
        setRoutes(r);
        setHubs(h);
      })
      .catch(() => setError('Could not load routes. Check your connection.'));
  }, []);

  return (
    <View style={styles.screen}>
      <MapView style={styles.map} initialRegion={BOHOL_REGION} showsUserLocation>
        {routes.map((r) => (
          <Polyline key={r.code} coordinates={r.coords} strokeColor={r.color} strokeWidth={4} />
        ))}
        {hubs.map((h) => (
          <Marker key={h.name} coordinate={h.coord} title={h.name} pinColor={colors.navy} />
        ))}
        {live.map((v) => (
          <Marker
            key={v.trip_id}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            title={`${v.vehicle_type === 'bus' ? 'Bus' : 'Van'} ${v.plate_no}`}
            description={`${v.seats_left} seats left · ${SEAT_LABEL[v.seat_status as SeatStatus] ?? v.seat_status}`}>
            <View style={[styles.van, { borderColor: colorOf(v.route_id) }]}>
              <Text style={styles.vanText}>{v.seats_left}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <View style={styles.sheet}>
        <Text style={styles.title}>Routes</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView style={styles.list}>
          {routes.map((r) => (
            <View key={r.code} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: r.color }]} />
              <Text style={styles.routeName}>{r.name}</Text>
              <Text style={styles.km}>
                {live.filter((v) => v.route_id === r.id).length || ''} {live.some((v) => v.route_id === r.id) ? 'live · ' : ''}
                {r.lengthKm} km
              </Text>
            </View>
          ))}
        </ScrollView>
        <Link href="/crew" asChild>
          <Pressable style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>I am a driver or conductor</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  map: { flex: 1 },
  sheet: { padding: 20, gap: 8, backgroundColor: colors.cream },
  title: { fontSize: 22, fontWeight: '700', color: colors.navy },
  error: { fontSize: 15, color: colors.orangeDark },
  list: { maxHeight: 150 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  routeName: { flex: 1, fontSize: 15, color: colors.navy },
  km: { fontSize: 14, color: colors.muted },
  van: { minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 16, borderWidth: 3, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  vanText: { color: colors.cream, fontSize: 14, fontWeight: '700' },
  button: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  buttonText: { color: colors.cream, fontSize: 16, fontWeight: '600' },
});
