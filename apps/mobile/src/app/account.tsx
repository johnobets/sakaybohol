import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

export default function AccountScreen() {
  const session = useSession();
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {session ? (
        <>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.body}>{session.user.email}</Text>
          <Pressable style={styles.button} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.buttonText}>Back to the map</Text>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button">
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <AuthForm reason="An account lets you tell drivers you are waiting, report full vans and road hazards." />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, gap: 12, backgroundColor: colors.cream },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  body: { fontSize: 16, color: colors.muted },
  button: { marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  buttonText: { color: colors.cream, fontSize: 17, fontWeight: '600' },
  link: { textAlign: 'center', fontSize: 15, color: colors.muted, textDecorationLine: 'underline', paddingVertical: 8 },
});
