import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';

import { toEwkt } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

type Estimate = { km: number; fare: number; base_fare: number; base_km: number; per_km: number };

// Tricycle fare from the spot picked on the home map to a point tapped here, plus an overcharge report.
export default function FareScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const session = useSession();
  const [to, setTo] = useState<LatLng | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [charged, setCharged] = useState('');
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const from = lat && lng ? { latitude: Number(lat), longitude: Number(lng) } : null;

  useEffect(() => {
    if (!lat || !lng || !to) return;
    supabase
      .rpc('fare_estimate', { o_lat: Number(lat), o_lng: Number(lng), d_lat: to.latitude, d_lng: to.longitude })
      .then(({ data, error }) => (error || !data?.[0] ? setMsg('Could not get the fare. Check your connection.') : setEst(data[0])));
  }, [lat, lng, to]);

  async function report() {
    if (!from || !to || !session) return;
    setBusy(true);
    const { error } = await supabase.from('fare_complaints').insert({
      reporter_id: session.user.id,
      from_geom: toEwkt(from.latitude, from.longitude),
      to_geom: toEwkt(to.latitude, to.longitude),
      charged: Number(charged),
      tricycle_no: plate.trim() || null,
    });
    setBusy(false);
    setMsg(error ? 'Could not send. Try again.' : 'Report sent to the traffic office. Thank you.');
    if (!error) setCharged('');
  }

  if (!from) {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>Pick where you start first: allow location, or long-press the home map.</Text>
      </View>
    );
  }

  const paid = Number(charged);
  const over = est && paid > est.fare;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.body}>Tap the map where you are going.</Text>
      <MapView style={styles.map} initialRegion={{ ...from, latitudeDelta: 0.04, longitudeDelta: 0.04 }} onPress={(e) => {
          setEst(null);
          setTo(e.nativeEvent.coordinate);
        }}>
        <Marker coordinate={from} title="From" pinColor="#2B7BB9" />
        {to ? <Marker coordinate={to} title="To" pinColor="#2E8B57" /> : null}
      </MapView>

      {est ? (
        <View style={styles.card}>
          <Text style={styles.fare}>₱{est.fare}</Text>
          <Text style={styles.body}>About {est.km} km by road</Text>
          <Text style={styles.small}>
            ₱{est.base_fare} for the first {est.base_km} km, then ₱{est.per_km} per km. Fare set by the city; ask the driver before you ride.
          </Text>
        </View>
      ) : null}

      {est ? (
        <>
          <Text style={styles.label}>Charged more? Report it</Text>
          {session ? (
            <>
              <TextInput style={styles.input} placeholder="Amount you paid (₱)" keyboardType="numeric" value={charged} onChangeText={setCharged} />
              <TextInput style={styles.input} placeholder="Tricycle body number (optional)" autoCapitalize="characters" maxLength={20} value={plate} onChangeText={setPlate} />
              {charged && !over ? <Text style={styles.small}>That is within the fare.</Text> : null}
              <Pressable style={[styles.button, (!over || busy) && styles.disabled]} disabled={!over || busy} onPress={report} accessibilityRole="button">
                <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Report overcharge'}</Text>
              </Pressable>
            </>
          ) : (
            <Link href="/account" style={styles.link}>Sign in to report an overcharge</Link>
          )}
        </>
      ) : null}
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, gap: 10, backgroundColor: colors.cream },
  map: { height: 280, borderRadius: 12 },
  body: { fontSize: 15, color: colors.muted },
  small: { fontSize: 13, color: colors.muted },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#C9D1D9', gap: 4 },
  fare: { fontSize: 32, fontWeight: '800', color: colors.navy },
  label: { marginTop: 6, fontSize: 15, fontWeight: '700', color: colors.navy },
  input: { borderWidth: 1, borderColor: '#C9D1D9', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FFFDF8', color: colors.ink },
  button: { padding: 16, borderRadius: 12, backgroundColor: colors.orangeDark, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.cream, fontSize: 17, fontWeight: '600' },
  link: { fontSize: 15, color: '#2B7BB9', textDecorationLine: 'underline' },
  msg: { fontSize: 14, color: colors.navy, fontWeight: '600' },
});
