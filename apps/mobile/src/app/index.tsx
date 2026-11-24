import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { fetchIncidents, INCIDENT_COLOR, INCIDENT_LABEL, type Incident } from '@/lib/incidents';
import { fetchHubs, fetchRouteLines, type Hub, type LatLng, type RouteLine } from '@/lib/routes';
import { SEAT_LABEL, type SeatStatus } from '@/lib/seats';
import { BOHOL_REGION, colors } from '@/lib/theme';
import { formatEta, useArrivals } from '@/lib/useArrivals';
import { useLiveVehicles } from '@/lib/useLiveVehicles';

type Spot = LatLng & { picked: boolean };

// Commuter home (Near Me): routes, live vans, and the vans coming to the commuter's spot with ETA.
export default function CommuterHome() {
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const live = useLiveVehicles(routes.map((r) => r.id));
  const { arrivals, error: etaError } = useArrivals(spot);
  const colorOf = (routeId: string) => routes.find((r) => r.id === routeId)?.color ?? colors.navy;

  useEffect(() => {
    Promise.all([fetchRouteLines(), fetchHubs()])
      .then(([r, h]) => {
        setRoutes(r);
        setHubs(h);
      })
      .catch(() => setError('Could not load routes. Check your connection.'));
    locateMe();
  }, []);

  // Approved hazards; refreshed every minute so new approvals and expiries show up.
  const [incidents, setIncidents] = useState<Incident[]>([]);
  useEffect(() => {
    const load = () => fetchIncidents().then(setIncidents).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  async function locateMe() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setGpsDenied(true);
      return;
    }
    setGpsDenied(false);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setSpot({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, picked: false });
  }

  const pickup = arrivals[0]?.pickup;

  return (
    <View style={styles.screen}>
      <MapView
        style={styles.map}
        initialRegion={BOHOL_REGION}
        showsUserLocation
        onLongPress={(e) => setSpot({ ...e.nativeEvent.coordinate, picked: true })}>
        {routes.map((r) => (
          <Polyline key={r.code} coordinates={r.coords} strokeColor={r.color} strokeWidth={4} />
        ))}
        {hubs.map((h) => (
          <Marker key={h.name} coordinate={h.coord} title={h.name} pinColor={colors.navy} />
        ))}
        {spot?.picked ? <Marker coordinate={spot} title="Your spot" pinColor="#2B7BB9" /> : null}
        {pickup ? <Marker coordinate={pickup} title="Wait here" description="Nearest point on the route" pinColor="#2E8B57" /> : null}
        {incidents.map((i) => (
          <Marker key={i.id} coordinate={i.coord} title={`⚠ ${INCIDENT_LABEL[i.type]}`} description={i.description ?? 'Reported by a commuter'}>
            <View style={[styles.hazard, { backgroundColor: INCIDENT_COLOR[i.type] }]}>
              <Text style={styles.hazardText}>!</Text>
            </View>
          </Marker>
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
        <Text style={styles.title}>Coming to you</Text>
        <Text style={styles.sub}>
          {spot?.picked ? 'From the spot you picked. ' : spot ? 'From your location. ' : ''}Long-press the map to pick another spot.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {etaError ? <Text style={styles.error}>Could not load arrival times. Check your connection.</Text> : null}
        {!spot && gpsDenied ? (
          <Pressable onPress={locateMe} accessibilityRole="button">
            <Text style={styles.error}>Location is off. Allow it, or long-press the map to pick a spot.</Text>
          </Pressable>
        ) : null}
        {spot?.picked ? (
          <Pressable onPress={locateMe} accessibilityRole="button">
            <Text style={styles.link}>Use my location instead</Text>
          </Pressable>
        ) : null}

        <ScrollView style={styles.list}>
          {spot && arrivals.length === 0 && !etaError ? (
            <Text style={styles.empty}>No vans coming within 1 km of this spot right now.</Text>
          ) : null}
          {arrivals.map((a) => (
            <View key={a.tripId} style={styles.arrival}>
              <View style={[styles.swatch, { backgroundColor: colorOf(a.routeId) }]} />
              <View style={styles.arrivalText}>
                <Text style={styles.eta}>{formatEta(a.etaMin)}</Text>
                <Text style={styles.arrivalLine}>
                  {a.vehicleType === 'bus' ? 'Bus' : 'Van'} {a.plateNo} → {a.towards}
                </Text>
                <Text style={styles.arrivalMeta}>
                  {a.seatsLeft} seats left · {(a.distanceM / 1000).toFixed(1)} km away
                  {a.walkM > 50 ? ` · walk ${Math.round(a.walkM)} m to the road` : ''}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.routesTitle}>Routes</Text>
          {routes.map((r) => (
            <View key={r.code} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: r.color }]} />
              <Text style={styles.routeName}>{r.name}</Text>
              <Text style={styles.km}>
                {live.some((v) => v.route_id === r.id) ? `${live.filter((v) => v.route_id === r.id).length} live · ` : ''}
                {r.lengthKm} km
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <Link href={spot ? { pathname: '/report', params: { lat: String(spot.latitude), lng: String(spot.longitude) } } : '/report'} asChild>
            <Pressable style={[styles.button, styles.half, styles.warn]} accessibilityRole="button">
              <Text style={styles.buttonText}>Report a hazard</Text>
            </Pressable>
          </Link>
          <Link href="/crew" asChild>
            <Pressable style={[styles.button, styles.half]} accessibilityRole="button">
              <Text style={styles.buttonText}>Driver or conductor</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  map: { flex: 1 },
  sheet: { padding: 20, gap: 6, backgroundColor: colors.cream },
  title: { fontSize: 22, fontWeight: '700', color: colors.navy },
  sub: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.orangeDark },
  link: { fontSize: 14, color: '#2B7BB9', textDecorationLine: 'underline' },
  list: { maxHeight: 230 },
  empty: { fontSize: 15, color: colors.muted, paddingVertical: 8 },
  arrival: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C9D1D9' },
  arrivalText: { flex: 1, gap: 2 },
  eta: { fontSize: 18, fontWeight: '700', color: colors.navy },
  arrivalLine: { fontSize: 15, color: colors.navy },
  arrivalMeta: { fontSize: 13, color: colors.muted },
  routesTitle: { marginTop: 12, fontSize: 15, fontWeight: '700', color: colors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  routeName: { flex: 1, fontSize: 15, color: colors.navy },
  km: { fontSize: 14, color: colors.muted },
  van: { minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 16, borderWidth: 3, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  vanText: { color: colors.cream, fontSize: 14, fontWeight: '700' },
  button: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  warn: { backgroundColor: colors.orangeDark },
  hazard: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  hazardText: { color: colors.cream, fontWeight: '800', fontSize: 15 },
  buttonText: { color: colors.cream, fontSize: 16, fontWeight: '600' },
});
