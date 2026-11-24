import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.cream,
      }}>
      <Stack.Screen name="index" options={{ title: 'SakayBohol' }} />
      <Stack.Screen name="crew" options={{ title: 'Crew mode' }} />
      <Stack.Screen name="report" options={{ title: 'Report a hazard' }} />
      <Stack.Screen name="plan" options={{ title: 'Plan a trip' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="fare" options={{ title: 'Tricycle fare' }} />
    </Stack>
  );
}
