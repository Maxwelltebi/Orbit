import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSphere, OrbitBackground, OrbitIcon } from './orbit-art';
import { OrbitButton } from './orbit-ui';
import { orbitColors } from '@/constants/orbit-theme';

export function LoginScreen({ setup, initialName, browser, onSubmit }: {
  setup: boolean; initialName: string; browser: boolean;
  onSubmit: (name: string, pin: string, confirmation: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitLock = useRef(false);
  const pinInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);
  const valid = !!name.trim() && /^\d{6}$/.test(pin) && (!setup || /^\d{6}$/.test(confirmation));
  async function submit() {
    if (!valid || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    try { await onSubmit(name, pin, confirmation); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not open your Orbit. Please try again.'); }
    finally {
      // Do not retain an entered PIN after either a failed or successful attempt.
      setPin(''); setConfirmation('');
      submitLock.current = false; setBusy(false);
    }
  }
  return (
    <View style={styles.screen}>
      <OrbitBackground />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.content}>
            <View style={styles.planet}>
              <GlassSphere size={108} />
              <View style={styles.ring}><OrbitIcon name="orbit" color="#F1F8EA" size={134} /></View>
            </View>
            <Text style={styles.brand}>Orbit</Text>
            <Text style={styles.title} accessibilityRole="header">{setup ? 'Find your space' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>{setup ? 'A little space, just for you.' : 'Make room for a calmer mind.'}</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.field}>
                <OrbitIcon name="person" size={18} color="#4C735A" />
                <TextInput value={name} onChangeText={setName} editable={!busy} maxLength={80}
                  placeholder="Your name" placeholderTextColor="#738574" accessibilityLabel="Login name"
                  autoCapitalize="words" autoCorrect={false} returnKeyType="next" onSubmitEditing={() => pinInput.current?.focus()}
                  style={styles.input} />
              </View>
              <View style={styles.pinHeading}>
                <Text style={styles.label}>{setup ? 'Create a six-digit PIN' : 'Your six-digit PIN'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide PIN' : 'Show PIN'}
                  disabled={busy} onPress={() => setVisible((value) => !value)} style={styles.show}>
                  <Text style={styles.showText}>{visible ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <TextInput ref={pinInput} value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))}
                editable={!busy} maxLength={6} keyboardType="number-pad" secureTextEntry={!visible}
                autoCorrect={false} autoComplete="off" textContentType="none" placeholder="Six digits"
                placeholderTextColor="#738574" accessibilityLabel="Login PIN" style={styles.pin}
                onSubmitEditing={() => setup ? confirmInput.current?.focus() : submit()} />
              {setup && <>
                <Text style={styles.label}>Confirm your PIN</Text>
                <TextInput ref={confirmInput} value={confirmation}
                  onChangeText={(value) => setConfirmation(value.replace(/\D/g, '').slice(0, 6))}
                  editable={!busy} maxLength={6} keyboardType="number-pad" secureTextEntry={!visible}
                  autoCorrect={false} autoComplete="off" textContentType="none" placeholder="Enter it again"
                  placeholderTextColor="#738574" accessibilityLabel="Confirm PIN" style={styles.pin} onSubmitEditing={submit} />
              </>}
              {!!error && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
              <OrbitButton disabled={!valid || busy} onPress={submit} style={styles.submit}>
                {busy ? (setup ? 'Saving your login…' : 'Opening your Orbit…') : setup ? 'Create my space' : 'Log in'}
              </OrbitButton>
              <Text style={styles.note}>{setup
                ? 'Keep your PIN somewhere safe. This local login has no email reset.'
                : 'Forgot your PIN? There is no online reset. Your saved thoughts stay on this device.'}</Text>
            </View>
            <Text style={styles.footer}>{browser ? 'Browser preview · phone secure storage is unavailable here.' : 'Saved on your phone. No online account needed.'}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  planet: { width: 108, height: 108, alignSelf: 'center', marginBottom: 12 },
  ring: { position: 'absolute', left: -13, top: -13 },
  brand: { fontSize: 36, color: orbitColors.white, fontWeight: '600', textAlign: 'center', letterSpacing: -1 },
  title: { color: orbitColors.white, fontSize: 29, textAlign: 'center', marginTop: 18 },
  subtitle: { color: '#E2ECDD', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 26 },
  card: { padding: 24, borderRadius: 28, backgroundColor: orbitColors.glass, borderWidth: 1, borderColor: 'rgba(245,252,238,0.25)' },
  label: { color: orbitColors.ink, fontSize: 14, marginBottom: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, marginBottom: 14 },
  input: { flex: 1, minHeight: 48, paddingVertical: 12, fontSize: 16, color: orbitColors.ink },
  pinHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  show: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  showText: { fontSize: 13, color: orbitColors.ink, textDecorationLine: 'underline' },
  pin: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.7)', fontSize: 18, letterSpacing: 3, color: orbitColors.ink, marginBottom: 18 },
  error: { color: '#9B302C', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  submit: { marginTop: 4 },
  note: { color: orbitColors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 18 },
  footer: { color: '#F0F7EB', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 24 },
});
