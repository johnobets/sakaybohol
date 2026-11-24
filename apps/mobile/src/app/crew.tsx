import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { clampSeats, SEAT_LABEL, seatStatus } from '@/lib/seats';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useTripBroadcast, type GpsStatus } from '@/lib/useTripBroadcast';

const GPS_LABEL: Record<GpsStatus, string> = {
  off: 'GPS off',
  starting: 'Finding your location…',
  live: 'Sharing location',
  denied: 'Location permission denied. Allow it in Settings to share your position.',
  error: 'Could not start GPS. Close and reopen the app.',
};

type Vehicle = { id: string; plate_no: string; type: string; capacity: number };
type RouteOption = { id: string; code: string; name: string };
type Direction = 'outbound' | 'inbound';
type Trip = { id: string; route_id: string; direction: Direction; seats_taken: number; started_at: string };

const TRIP_COLUMNS = 'id, route_id, direction, seats_taken, started_at';

// Crew mode. Sprint 3 adds background GPS and the Realtime broadcast to this screen.
export default function CrewScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <View style={styles.center}><ActivityIndicator color={colors.navy} /></View>;
  return session ? <CrewHome userId={session.user.id} /> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : 'Could not sign in. Check your connection.');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Crew sign in</Text>
      <Text style={styles.body}>Use the account your traffic office gave you.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={signIn}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!email || !password || busy) && styles.disabled]}
        onPress={signIn}
        disabled={!email || !password || busy}
        accessibilityRole="button">
        <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function CrewHome({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>('outbound');
  const [busy, setBusy] = useState(false);

  const gps = useTripBroadcast(
    trip && vehicle
      ? {
          tripId: trip.id,
          routeId: trip.route_id,
          direction: trip.direction,
          plateNo: vehicle.plate_no,
          vehicleType: vehicle.type,
          seatsLeft: Math.max(vehicle.capacity - trip.seats_taken, 0),
          seatStatus: seatStatus(vehicle.capacity, trip.seats_taken),
        }
      : null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const [profile, veh, rts, active] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).single(),
      supabase.from('vehicles').select('id, plate_no, type, capacity').eq('assigned_crew_id', userId).eq('active', true).maybeSingle(),
      supabase.from('route_lines').select('id, code, name').order('code'),
      supabase.from('trips').select(TRIP_COLUMNS).eq('crew_id', userId).eq('status', 'active').maybeSingle(),
    ]);
    setLoading(false);
    if (profile.error || veh.error || rts.error || active.error) {
      setNotice('Could not load your crew details. Check your connection.');
      return;
    }
    if (profile.data.role !== 'crew') setNotice('This account is not a crew account. Ask the traffic office to set it up.');
    else if (!veh.data) setNotice('No vehicle is assigned to you yet. Ask the traffic office to assign one.');
    setVehicle(veh.data);
    setRoutes(rts.data);
    setTrip(active.data);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Commuters who tapped "I'm waiting" ahead on this route, checked every 30 s.
  const [waiting, setWaiting] = useState<{ waiting: number; nearest_m: number | null } | null>(null);
  const tripId = trip?.id;
  useEffect(() => {
    if (!tripId) return setWaiting(null);
    const load = () =>
      supabase.rpc('waiting_ahead', { p_trip: tripId }).then(({ data }) => setWaiting(data?.[0] ?? null));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [tripId]);

  async function startTrip() {
    if (!vehicle || !routeId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('trips')
      .insert({ route_id: routeId, vehicle_id: vehicle.id, crew_id: userId, direction })
      .select(TRIP_COLUMNS)
      .single();
    setBusy(false);
    if (error) {
      setNotice(error.code === '23505' ? 'This vehicle already has an active trip.' : 'Could not start the trip. Try again.');
      return;
    }
    setNotice(null);
    setTrip(data);
  }

  // ponytail: optimistic and one request per tap; batch taps if conductors press faster than the network.
  async function changeSeats(delta: number) {
    if (!trip || !vehicle) return;
    const taken = clampSeats(vehicle.capacity, trip.seats_taken + delta);
    if (taken === trip.seats_taken) return;
    const before = trip;
    setTrip({ ...trip, seats_taken: taken });
    const { error } = await supabase
      .from('trips')
      .update({ seats_taken: taken, seat_status: seatStatus(vehicle.capacity, taken) })
      .eq('id', trip.id);
    if (error) {
      setTrip(before);
      setNotice('Seat count not saved. Check your connection.');
    }
  }

  function confirmEnd() {
    Alert.alert('End this trip?', 'Commuters will stop seeing this vehicle.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End trip', style: 'destructive', onPress: endTrip },
    ]);
  }

  async function endTrip() {
    if (!trip) return;
    setBusy(true);
    gps.announceEnded();
    const { error } = await supabase
      .from('trips')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', trip.id);
    setBusy(false);
    if (error) {
      setNotice('Could not end the trip. Try again.');
      return;
    }
    setTrip(null);
    setRouteId(null);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.navy} /></View>;

  const route = trip ? routes.find((r) => r.id === trip.route_id) : null;
  const left = trip && vehicle ? vehicle.capacity - trip.seats_taken : 0;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {vehicle ? (
        <Text style={styles.vehicle}>
          {vehicle.plate_no} · {vehicle.type} · {vehicle.capacity} seats
        </Text>
      ) : null}
      {notice ? <Text style={styles.error}>{notice}</Text> : null}

      {trip && vehicle ? (
        <>
          <Text style={styles.title}>{route?.name ?? 'Active trip'}</Text>
          <Text style={styles.body}>
            {trip.direction === 'outbound' ? 'Outbound' : 'Inbound'} · started{' '}
            {new Date(trip.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <View style={styles.gpsRow}>
            <View style={[styles.gpsDot, gps.status === 'live' && styles.gpsDotLive]} />
            <Text style={styles.gpsText}>{GPS_LABEL[gps.status]}</Text>
          </View>
          <Text style={styles.hintDark}>Keep this screen open while driving.</Text>
          {waiting && waiting.waiting > 0 ? (
            <Text style={styles.waiting}>
              {waiting.waiting} {waiting.waiting === 1 ? 'person' : 'people'} waiting ahead · nearest in{' '}
              {waiting.nearest_m != null && waiting.nearest_m >= 1000 ? `${(waiting.nearest_m / 1000).toFixed(1)} km` : `${waiting.nearest_m ?? 0} m`}
            </Text>
          ) : null}

          <View style={styles.counter}>
            <Text style={styles.seatsLeft}>{left}</Text>
            <Text style={styles.seatsLabel}>seats left · {SEAT_LABEL[seatStatus(vehicle.capacity, trip.seats_taken)]}</Text>
            <View style={styles.counterRow}>
              <Pressable style={styles.counterButton} onPress={() => changeSeats(-1)} accessibilityLabel="Passenger got off">
                <Text style={styles.counterText}>−</Text>
              </Pressable>
              <Pressable style={styles.counterButton} onPress={() => changeSeats(1)} accessibilityLabel="Passenger got on">
                <Text style={styles.counterText}>+</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>Tap + when someone boards, − when someone gets off.</Text>
          </View>

          <Pressable style={[styles.endButton, busy && styles.disabled]} onPress={confirmEnd} disabled={busy} accessibilityRole="button">
            <Text style={styles.buttonText}>End trip</Text>
          </Pressable>
        </>
      ) : vehicle && !notice ? (
        <>
          <Text style={styles.title}>Start a trip</Text>
          <Text style={styles.label}>Route</Text>
          {routes.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.option, routeId === r.id && styles.optionOn]}
              onPress={() => setRouteId(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: routeId === r.id }}>
              <Text style={[styles.optionText, routeId === r.id && styles.optionTextOn]}>{r.name}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Direction</Text>
          <View style={styles.directionRow}>
            {(['outbound', 'inbound'] as const).map((d) => (
              <Pressable
                key={d}
                style={[styles.option, styles.half, direction === d && styles.optionOn]}
                onPress={() => setDirection(d)}
                accessibilityRole="radio"
                accessibilityState={{ selected: direction === d }}>
                <Text style={[styles.optionText, direction === d && styles.optionTextOn]}>
                  {d === 'outbound' ? 'Outbound' : 'Inbound'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.button, (!routeId || busy) && styles.disabled]}
            onPress={startTrip}
            disabled={!routeId || busy}
            accessibilityRole="button">
            <Text style={styles.buttonText}>{busy ? 'Starting…' : 'Start trip'}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button" style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  screen: { flexGrow: 1, padding: 24, gap: 12, backgroundColor: colors.cream },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  body: { fontSize: 16, color: colors.muted },
  vehicle: { fontSize: 14, fontWeight: '600', color: colors.orangeDark, letterSpacing: 0.5 },
  error: { fontSize: 15, color: colors.orangeDark },
  label: { marginTop: 8, fontSize: 14, fontWeight: '600', color: colors.muted },
  input: { borderWidth: 1, borderColor: '#C9D1D9', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FFFDF8', color: colors.ink },
  button: { marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  endButton: { marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: colors.orangeDark, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.cream, fontSize: 17, fontWeight: '600' },
  option: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#C9D1D9', backgroundColor: '#FFFDF8' },
  optionOn: { borderColor: colors.navy, backgroundColor: colors.navy },
  optionText: { fontSize: 16, color: colors.navy },
  optionTextOn: { color: colors.cream, fontWeight: '600' },
  directionRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, alignItems: 'center' },
  counter: { marginTop: 8, padding: 20, borderRadius: 16, backgroundColor: colors.navy, alignItems: 'center', gap: 6 },
  seatsLeft: { fontSize: 72, fontWeight: '700', color: colors.cream },
  seatsLabel: { fontSize: 16, color: colors.orange, fontWeight: '600' },
  counterRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  counterButton: { width: 96, height: 72, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  counterText: { fontSize: 40, fontWeight: '700', color: colors.navy },
  hint: { marginTop: 4, fontSize: 13, color: '#C9D6E0', textAlign: 'center' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9FB3C2' },
  gpsDotLive: { backgroundColor: '#2E8B57' },
  gpsText: { flex: 1, fontSize: 15, color: colors.navy },
  hintDark: { fontSize: 13, color: colors.muted },
  waiting: { fontSize: 16, fontWeight: '700', color: '#2E8B57' },
  signOut: { marginTop: 'auto', paddingVertical: 12, alignItems: 'center' },
  signOutText: { fontSize: 15, color: colors.muted, textDecorationLine: 'underline' },
});
