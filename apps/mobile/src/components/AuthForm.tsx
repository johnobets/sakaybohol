import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Sign in or create a commuter account. Shown where a feature needs an account (reports, alerts).
export function AuthForm({ reason }: { reason: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : 'Could not sign in. Check your connection.');
    } else if (password.length < 8) {
      setMessage('Use at least 8 characters for your password.');
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setMessage(error.status === 429 ? 'Too many sign-ups right now. Try again in an hour.' : error.message);
      else if (!data.session) setMessage('Check your email and tap the link to confirm your account, then sign in.');
    }
    setBusy(false);
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{mode === 'in' ? 'Sign in' : 'Create an account'}</Text>
      <Text style={styles.body}>{reason}</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" value={email} onChangeText={setEmail} />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        autoComplete={mode === 'in' ? 'password' : 'new-password'}
        textContentType={mode === 'in' ? 'password' : 'newPassword'}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable style={[styles.button, (!email || !password || busy) && styles.disabled]} disabled={!email || !password || busy} onPress={submit} accessibilityRole="button">
        <Text style={styles.buttonText}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} accessibilityRole="button">
        <Text style={styles.link}>{mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.navy },
  body: { fontSize: 15, color: colors.muted },
  input: { borderWidth: 1, borderColor: '#C9D1D9', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FFFDF8', color: colors.ink },
  message: { fontSize: 14, color: colors.orangeDark },
  button: { padding: 16, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.cream, fontSize: 17, fontWeight: '600' },
  link: { textAlign: 'center', fontSize: 15, color: '#2B7BB9', paddingVertical: 6 },
});
