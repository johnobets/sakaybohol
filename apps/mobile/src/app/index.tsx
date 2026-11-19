import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';

import { BOHOL_REGION, colors } from '@/lib/theme';

// Commuter home (Near Me). Sprint 3: live vehicles from the route:{id} Realtime channel.
export default function CommuterHome() {
  return (
    <View style={styles.screen}>
      <MapView style={styles.map} initialRegion={BOHOL_REGION} showsUserLocation />
      <View style={styles.sheet}>
        <Text style={styles.title}>Near you</Text>
        <Text style={styles.body}>Live buses and vans will appear here.</Text>
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
  body: { fontSize: 16, color: colors.muted },
  button: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  buttonText: { color: colors.cream, fontSize: 16, fontWeight: '600' },
});
