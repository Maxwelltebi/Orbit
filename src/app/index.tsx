import { router, usePathname } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitIcon } from '@/components/orbit-art';
import { ThoughtOrbit } from '@/components/thought-orbit';
import { OrbitButton, OrbitDialog } from '@/components/orbit-ui';
import { orbitColors, previewEncouragement } from '@/constants/orbit-theme';
import { dominantCategory } from '@/services/bubble-layout';
import { suggestedCategories } from '@/services/thought-organizer';
import { profileInitials, useOrbit } from '@/state/orbit-context';

export default function HomeScreen() {
  const { thoughts, categories, dominantCategoryId, storageKind, profile, addThought } = useOrbit();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [composerOpen, setComposerOpen] = useState(false);
  const [thought, setThought] = useState('');
  const [categoryHint, setCategoryHint] = useState('');
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const selectedCategory = categories.find((category) => category.id === openCategory);
  const categoryThoughts = thoughts.filter((entry) => entry.categoryId === openCategory);
  const suggestions = [...new Set([...categories.map((category) => category.label), ...suggestedCategories])];
  const counts = new Map<string, number>();
  for (const entry of thoughts) counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1);
  const initials = profileInitials(profile.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  async function submitThought() {
    if (!thought.trim() || submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await addThought(thought, categoryHint);
      setSaveNotice(`Saved ${result.count} ${result.count === 1 ? 'thought' : 'thoughts'} to ${result.categories.join(', ')}.${result.unsorted ? ' Anything uncertain is kept in Unsorted.' : ''}`);
      setThought('');
      setCategoryHint('');
      setComposerOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save your thought. Your draft is still here.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: 12, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.greeting}>{greeting}{profile.name.trim() ? `, ${profile.name.trim().split(/\s+/)[0]}` : ''}</Text>
              <Text style={styles.title} accessibilityRole="header">My Orbit</Text>
              <Text style={styles.subtitle}>What’s on your mind today?</Text>
            </View>
            <Pressable onPress={() => router.navigate('/profile')} accessibilityRole="button"
              accessibilityLabel="Open your profile" style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              {initials ? <Text style={styles.initials}>{initials}</Text> : <OrbitIcon name="person" size={20} />}
            </Pressable>
          </View>

          <ThoughtOrbit categories={categories} counts={counts} leaderId={dominantCategory(categories, counts, dominantCategoryId)}
            paused={composerOpen || openCategory !== null || pathname !== '/'} onOpen={setOpenCategory} />

          <View style={styles.actions}>
            <Text style={styles.hint}>{categories.length ? 'Tap a bubble to revisit your thoughts.' : 'No need to choose a category. Start anywhere.'}</Text>
            <OrbitButton icon="plus" onPress={() => { setSubmitError(''); setComposerOpen(true); }}>Add a thought</OrbitButton>
            {!!saveNotice && <Text style={styles.saveNotice} accessibilityLiveRegion="polite">{saveNotice}</Text>}
            <View style={styles.calmCard}>
              <OrbitIcon name="leaf" size={23} color="#477457" />
              <View style={styles.calmText}>
                <Text style={styles.cardLabel}>A moment of calm</Text>
                <Text style={styles.quote}>“{previewEncouragement}”</Text>
                <Text style={styles.previewLabel}>Preview encouragement</Text>
              </View>
            </View>
            <Text style={styles.storageNote}>Saved {storageKind === 'browser' ? 'in this browser' : 'on this device'}</Text>
          </View>
        </View>
      </ScrollView>

      <OrbitDialog visible={composerOpen} title="Make a little space" onClose={() => { if (!submitting) setComposerOpen(false); }}>
        <Text style={styles.sheetBody}>A sentence, a worry, or a whole thought dump. Start anywhere.</Text>
        <TextInput value={thought} onChangeText={setThought} multiline textAlignVertical="top"
          placeholder="What’s on your mind?" placeholderTextColor="#738574" accessibilityLabel="Your thought"
          style={styles.input} maxLength={12000} editable={!submitting} />
        <Text style={styles.sheetFootnote}>Basic offline sorting is available in this preview. Gemma AI sorting is not connected yet; uncertain thoughts go to Unsorted.</Text>
        <Text style={styles.fieldLabel}>Category hint (optional)</Text>
        <View style={styles.chips}>
          <Pressable onPress={() => setCategoryHint('')} disabled={submitting} accessibilityRole="radio"
            accessibilityState={{ checked: !categoryHint }} style={[styles.chip, !categoryHint && styles.chipSelected]}>
            <Text style={[styles.chipText, !categoryHint && styles.chipSelectedText]}>Sort for me</Text>
          </Pressable>
          {suggestions.map((label) => <Pressable key={label} disabled={submitting} onPress={() => setCategoryHint(categoryHint === label ? '' : label)}
            accessibilityRole="radio" accessibilityState={{ checked: label === categoryHint }}
            style={({ pressed }) => [styles.chip, label === categoryHint && styles.chipSelected, pressed && styles.pressed]}>
            <Text style={[styles.chipText, label === categoryHint && styles.chipSelectedText]}>{label}</Text>
          </Pressable>)}
        </View>
        <TextInput value={categoryHint} onChangeText={setCategoryHint} editable={!submitting} maxLength={48}
          placeholder="Or name your own category" placeholderTextColor="#738574" accessibilityLabel="Optional category name" style={styles.categoryInput} />
        <Text style={styles.sheetFootnote}>Leave this blank to sort each sentence. A category hint puts the whole entry in that bubble.</Text>
        {!!submitError && <Text style={styles.error} accessibilityRole="alert">{submitError}</Text>}
        <OrbitButton disabled={!thought.trim() || submitting} onPress={submitThought}>{submitting ? 'Organising your thoughts…' : 'Add to my Orbit'}</OrbitButton>
      </OrbitDialog>

      <OrbitDialog visible={openCategory !== null} title={selectedCategory?.label ?? 'Your thoughts'} onClose={() => setOpenCategory(null)}>
        <Text style={styles.sheetBody}>{selectedCategory?.label === 'Unsorted' ? 'These thoughts are saved safely. Basic sorting could not confidently place them; Gemma will handle broader topics once connected.' : `${categoryThoughts.length} ${categoryThoughts.length === 1 ? 'thought is' : 'thoughts are'} taking up space here. You can come back to them one at a time.`}</Text>
        <View style={styles.categoryCalm}>
          <OrbitIcon name="leaf" size={20} color="#477457" />
          <Text style={styles.categoryQuote}>“{previewEncouragement}”</Text>
          <Text style={styles.sheetFootnote}>Preview text · personalized encouragement isn’t available yet.</Text>
        </View>
        {categoryThoughts.map((entry) => <View key={entry.id} style={styles.thoughtCard}>
          <Text style={styles.thoughtText}>{entry.text}</Text>
          <Text style={styles.thoughtTime}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>)}
      </OrbitDialog>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  content: { flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1 },
  greeting: { fontSize: 14, color: '#EBF3E6', marginBottom: 10 },
  title: { fontSize: 40, fontWeight: '600', letterSpacing: -1.3, color: orbitColors.white },
  subtitle: { fontSize: 17, color: '#E2ECDD', marginTop: 3 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(224, 240, 217, 0.76)', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 15, fontWeight: '600', color: orbitColors.ink },
  actions: { gap: 16 },
  hint: { textAlign: 'center', color: orbitColors.white, fontSize: 13 },
  calmCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 22, backgroundColor: orbitColors.glass, borderWidth: 1, borderColor: 'rgba(245, 252, 238, 0.25)' },
  calmText: { flex: 1 },
  cardLabel: { fontSize: 12, color: orbitColors.ink, marginBottom: 7 },
  quote: { fontSize: 15, lineHeight: 22, color: '#1C3325' },
  previewLabel: { fontSize: 10, color: orbitColors.muted, marginTop: 9 },
  storageNote: { fontSize: 10, color: '#234432', textAlign: 'center' },
  saveNotice: { fontSize: 13, lineHeight: 20, color: orbitColors.white, textAlign: 'center' },
  error: { fontSize: 13, lineHeight: 20, color: '#9B302C' },
  pressed: { opacity: 0.75 },
  sheetBody: { color: orbitColors.muted, fontSize: 15, lineHeight: 23 },
  input: { minHeight: 150, maxHeight: 250, borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: '#CDDCC6', color: orbitColors.ink, fontSize: 16, lineHeight: 24 },
  categoryInput: { minHeight: 48, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: '#CDDCC6', color: orbitColors.ink, fontSize: 15 },
  fieldLabel: { color: orbitColors.ink, fontSize: 14, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 15, paddingVertical: 12, minHeight: 44, borderRadius: 24, borderWidth: 1, borderColor: '#B4C9AC', backgroundColor: '#E2ECD9' },
  chipSelected: { backgroundColor: orbitColors.forest, borderColor: orbitColors.forest },
  chipText: { color: orbitColors.ink, fontSize: 14 },
  chipSelectedText: { color: orbitColors.white },
  sheetFootnote: { color: orbitColors.muted, fontSize: 12, lineHeight: 18 },
  categoryCalm: { backgroundColor: '#DDEAD6', borderRadius: 20, padding: 18, gap: 10 },
  categoryQuote: { color: orbitColors.ink, fontSize: 18, lineHeight: 27 },
  thoughtCard: { padding: 16, backgroundColor: '#FAFCF6', borderRadius: 18, gap: 12 },
  thoughtText: { color: orbitColors.ink, fontSize: 15, lineHeight: 23 },
  thoughtTime: { color: orbitColors.muted, fontSize: 11 },
});
