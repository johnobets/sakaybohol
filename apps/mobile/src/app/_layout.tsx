import { Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { setLang, useT } from '@/lib/i18n';
import { colors } from '@/lib/theme';

// Header pill that switches English <-> Bisaya; the choice is remembered on the phone.
function LangToggle() {
  const { lang } = useT();
  return (
    <Pressable
      onPress={() => setLang(lang === 'en' ? 'bis' : 'en')}
      accessibilityRole="button"
      accessibilityLabel={lang === 'en' ? 'Switch to Bisaya' : 'Switch to English'}
      hitSlop={10}
      style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.cream }}>
      <Text style={{ color: colors.cream, fontSize: 13, fontWeight: '600' }}>{lang === 'en' ? 'Bisaya' : 'English'}</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.cream,
      }}>
      <Stack.Screen name="index" options={{ title: 'SakayBohol', headerRight: () => <LangToggle /> }} />
      <Stack.Screen name="crew" options={{ title: t('Crew mode') }} />
      <Stack.Screen name="report" options={{ title: t('Report a hazard') }} />
      <Stack.Screen name="plan" options={{ title: t('Plan a trip') }} />
      <Stack.Screen name="account" options={{ title: t('Account') }} />
      <Stack.Screen name="fare" options={{ title: t('Tricycle fare') }} />
    </Stack>
  );
}
