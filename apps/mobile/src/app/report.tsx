import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { useT } from '@/lib/i18n';
import { INCIDENT_COLOR, INCIDENT_LABEL, type IncidentType } from '@/lib/incidents';
import { toEwkt } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const TYPES: IncidentType[] = ['flood', 'landslide', 'accident', 'roadwork', 'other'];

// Report a hazard at the spot chosen on the home map (GPS or long-press). Admins approve before it shows.
export default function ReportScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [type, setType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { t } = useT();
  const tr = t; // the type chips below use t as their loop variable

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function pick(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(fromCamera ? 'Camera permission is off.' : 'Photo permission is off.');
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, allowsEditing: false };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  async function submit() {
    if (!session || !type || !lat || !lng) return;
    setBusy(true);
    setError(null);
    let photoPath: string | null = null;
    if (photo) {
      // Folder = user id, as the storage policy requires.
      photoPath = `${session.user.id}/${Date.now()}.jpg`;
      const body = await (await fetch(photo.uri)).arrayBuffer();
      const up = await supabase.storage.from('incident-photos').upload(photoPath, body, { contentType: photo.mimeType ?? 'image/jpeg' });
      if (up.error) {
        setBusy(false);
        return setError('Photo upload failed. Try again, or send without a photo.');
      }
    }
    const { error } = await supabase.from('incidents').insert({
      reporter_id: session.user.id,
      type,
      description: description.trim() || null,
      photo_path: photoPath,
      geom: toEwkt(Number(lat), Number(lng)),
    });
    setBusy(false);
    if (error) return setError('Could not send the report. Check your connection.');
    setSent(true);
  }

  if (!lat || !lng) {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>{t('Pick a spot first: allow location, or long-press the map where the hazard is.')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {!session ? (
        <AuthForm reason={t('Sign in so the traffic office can follow up on your report.')} />
      ) : sent ? (
        <>
          <Text style={styles.title}>{t('Thank you')}</Text>
          <Text style={styles.body}>{t('Your report was sent. It appears on the map once the traffic office approves it.')}</Text>
          <Pressable style={styles.button} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('Back to the map')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('Report a hazard')}</Text>
          <Text style={styles.body}>
            {t('At {lat}, {lng}. To report another spot, go back and long-press the map.', { lat: Number(lat).toFixed(5), lng: Number(lng).toFixed(5) })}
          </Text>
          <Text style={styles.label}>{t('What is it?')}</Text>
          <View style={styles.types}>
            {TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, type === t && { backgroundColor: INCIDENT_COLOR[t], borderColor: INCIDENT_COLOR[t] }]}
                onPress={() => setType(t)}
                accessibilityRole="radio"
                accessibilityState={{ selected: type === t }}>
                <Text style={[styles.chipText, type === t && styles.chipTextOn]}>{tr(INCIDENT_LABEL[t])}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{t('Details (optional)')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t('e.g. Knee-deep flood, vans turning back')}
            multiline
            maxLength={500}
            value={description}
            onChangeText={setDescription}
          />
          <Text style={styles.label}>{t('Photo (optional)')}</Text>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Photo to send" /> : null}
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={() => pick(true)} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('Take photo')}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => pick(false)} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('Choose photo')}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{t(error)}</Text> : null}
          <Pressable style={[styles.button, (!type || busy) && styles.disabled]} disabled={!type || busy} onPress={submit} accessibilityRole="button">
            <Text style={styles.buttonText}>{t(busy ? 'Sending…' : 'Send report')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, gap: 12, backgroundColor: colors.cream },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  body: { fontSize: 15, color: colors.muted },
  label: { marginTop: 6, fontSize: 14, fontWeight: '600', color: colors.muted },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#C9D1D9', backgroundColor: '#FFFDF8' },
  chipText: { fontSize: 15, color: colors.navy },
  chipTextOn: { color: colors.cream, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#C9D1D9', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FFFDF8', color: colors.ink },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  photo: { width: '100%', height: 200, borderRadius: 12 },
  row: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.navy, alignItems: 'center' },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  error: { fontSize: 14, color: colors.orangeDark },
  button: { marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.cream, fontSize: 17, fontWeight: '600' },
});
