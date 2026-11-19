import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

// Crew mode. Sprint 2: crew sign-in. Sprint 3: Start trip, background GPS, Realtime broadcast.
export default function CrewHome() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Crew mode</Text>
      <Text style={styles.body}>Sign in with the account from your traffic office to start a trip.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 12, backgroundColor: colors.cream },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  body: { fontSize: 16, color: colors.muted },
});
