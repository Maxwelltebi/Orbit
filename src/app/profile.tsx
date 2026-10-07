import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSphere, OrbitIcon } from '@/components/orbit-art';
import { OrbitButton } from '@/components/orbit-ui';
import { orbitColors } from '@/constants/orbit-theme';
import { profileInitials, useOrbit } from '@/state/orbit-context';

export default function ProfileScreen() {
  const { profile, updateProfile } = useOrbit();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(profile.name);
  const [about, setAbout] = useState(profile.about);
  const [saved, setSaved] = useState(false);
  const nameInput = useRef<TextInput>(null);
  const initials = profileInitials(saved ? profile.name : name);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: 28, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">Your profile</Text>
          <Text style={styles.subtitle}>A little about you.</Text>
          <View style={styles.avatarGroup}>
            <GlassSphere size={112} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.initialsPosition]}>
              {initials ? <Text style={styles.initials}>{initials}</Text> : <OrbitIcon name="person" size={36} />}
            </View>
            <Pressable style={styles.edit} onPress={() => nameInput.current?.focus()}
              accessibilityRole="button" accessibilityLabel="Edit your name">
              <OrbitIcon name="edit" size={19} />
            </Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <View style={styles.field}>
              <OrbitIcon name="person" size={18} color="#4C735A" />
              <TextInput ref={nameInput} value={name} onChangeText={(value) => { setName(value); setSaved(false); }}
                placeholder="Your name" placeholderTextColor="#738574" accessibilityLabel="Your name"
                autoCapitalize="words" maxLength={80} style={styles.nameInput} />
            </View>
            <Text style={styles.label}>About me</Text>
            <TextInput value={about} onChangeText={(value) => { setAbout(value); setSaved(false); }}
              placeholder="A little about you, in your own words." placeholderTextColor="#738574"
              accessibilityLabel="About you" multiline textAlignVertical="top" maxLength={500} style={styles.aboutInput} />
            <OrbitButton style={styles.save} onPress={() => {
              updateProfile({ name: name.trim(), about: about.trim() });
              setSaved(true);
            }}>Save changes</OrbitButton>
            {saved && <Text accessibilityLiveRegion="polite" style={styles.saved}>Profile updated for this session.</Text>}
          </View>
          <View style={styles.localNote}>
            <OrbitIcon name="orbit" size={22} color="#345B40" />
            <View style={styles.noteText}>
              <Text style={styles.noteTitle}>Your space. No account needed.</Text>
              <Text style={styles.noteBody}>Changes in this preview last until the app restarts.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 38, fontWeight: '600', letterSpacing: -1.2, color: orbitColors.white },
  subtitle: { fontSize: 17, color: '#E2ECDD', marginTop: 5 },
  avatarGroup: { width: 112, height: 112, alignSelf: 'center', marginVertical: 26 },
  initialsPosition: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 32, color: orbitColors.ink, fontWeight: '500' },
  edit: { position: 'absolute', right: -6, bottom: -2, width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5FAF0', alignItems: 'center', justifyContent: 'center' },
  card: { padding: 24, borderRadius: 28, backgroundColor: orbitColors.glass, borderWidth: 1, borderColor: 'rgba(245,252,238,0.25)' },
  label: { color: orbitColors.ink, fontSize: 14, marginBottom: 7 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 12, marginBottom: 20 },
  nameInput: { flex: 1, minHeight: 48, paddingVertical: 12, color: orbitColors.ink, fontSize: 15 },
  aboutInput: { minHeight: 104, padding: 14, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 12, fontSize: 15, lineHeight: 22, color: orbitColors.ink },
  save: { marginTop: 24 },
  saved: { color: orbitColors.ink, fontSize: 12, textAlign: 'center', marginTop: 14 },
  localNote: { flexDirection: 'row', gap: 12, padding: 18, marginTop: 20 },
  noteText: { flex: 1, gap: 6 },
  noteTitle: { color: '#234432', fontSize: 13, fontWeight: '500' },
  noteBody: { color: '#345840', fontSize: 12, lineHeight: 19 },
});
