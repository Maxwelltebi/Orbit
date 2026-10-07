import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSphere, OrbitIcon, OrbitRings } from '@/components/orbit-art';
import { OrbitButton, OrbitSheet } from '@/components/orbit-ui';
import { orbitColors, previewEncouragement } from '@/constants/orbit-theme';
import { categories, profileInitials, useOrbit, type CategoryId } from '@/state/orbit-context';

export default function HomeScreen() {
  const { thoughts, profile, addThought } = useOrbit();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [canvasWidth, setCanvasWidth] = useState(Math.min(width - 48, 440));
  const [composerOpen, setComposerOpen] = useState(false);
  const [thought, setThought] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId | null>(null);
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(null);
  const selectedCategory = categories.find((category) => category.id === openCategory);
  const categoryThoughts = thoughts.filter((entry) => entry.categoryId === openCategory);
  const scale = canvasWidth / 340;
  const initials = profileInitials(profile.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  function submitThought() {
    if (!thought.trim() || !categoryId) return;
    addThought(thought, categoryId);
    setThought('');
    setCategoryId(null);
    setComposerOpen(false);
  }

  return (
    <>
      <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100 }]}>
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

          <View style={styles.universe} onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)}>
            <OrbitRings />
            {categories.map((category) => {
              const count = thoughts.filter((entry) => entry.categoryId === category.id).length;
              // Cap growth to keep neighboring bubbles separate and tappable.
              const radius = category.radius + Math.min(4, Math.sqrt(count) * 1.7);
              const size = radius * 2 * scale;
              return (
                <Pressable key={category.id} accessibilityRole="button"
                  accessibilityLabel={`${category.label}, ${count} ${count === 1 ? 'thought' : 'thoughts'}. Open category.`}
                  onPress={() => setOpenCategory(category.id)}
                  style={({ pressed }) => [styles.bubble, {
                    left: (category.x - radius) * scale, top: (category.y - radius) * scale,
                    width: size, height: size, borderRadius: size / 2,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  }]}>
                  <View style={StyleSheet.absoluteFill} pointerEvents="none"><GlassSphere size={size} /></View>
                  <Text style={[styles.bubbleLabel, { fontSize: category.id === 'future' ? 20 : category.id === 'what-if' ? 13 : 16 }]}
                    maxFontSizeMultiplier={1.4}>{category.label}</Text>
                  {count > 0 && <Text style={styles.bubbleCount}>{count} {count === 1 ? 'thought' : 'thoughts'}</Text>}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Text style={styles.hint}>Tap a thought to find a little calm.</Text>
            <OrbitButton icon="plus" onPress={() => setComposerOpen(true)}>Add a thought</OrbitButton>
            <View style={styles.calmCard}>
              <OrbitIcon name="leaf" size={23} color="#477457" />
              <View style={styles.calmText}>
                <Text style={styles.cardLabel}>A moment of calm</Text>
                <Text style={styles.quote}>“{previewEncouragement}”</Text>
                <Text style={styles.previewLabel}>Preview encouragement · Gemma comes next</Text>
              </View>
            </View>
            <Text style={styles.sessionNote}>UI preview · thoughts stay only until the app restarts</Text>
          </View>
        </View>
      </ScrollView>

      <OrbitSheet visible={composerOpen} title="Make a little space" onClose={() => setComposerOpen(false)}>
        <Text style={styles.sheetBody}>A sentence, a worry, or a whole thought dump. Start anywhere.</Text>
        <TextInput value={thought} onChangeText={setThought} multiline textAlignVertical="top"
          placeholder="What’s on your mind?" placeholderTextColor="#738574" accessibilityLabel="Your thought"
          style={styles.input} maxLength={12000} />
        <Text style={styles.fieldLabel}>Where does this thought belong?</Text>
        <View style={styles.chips}>
          {categories.map((category) => <Pressable key={category.id} onPress={() => setCategoryId(category.id)}
            accessibilityRole="radio" accessibilityState={{ checked: category.id === categoryId }}
            style={({ pressed }) => [styles.chip, category.id === categoryId && styles.chipSelected, pressed && styles.pressed]}>
            <Text style={[styles.chipText, category.id === categoryId && styles.chipSelectedText]}>{category.label}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.sheetFootnote}>Choose a category for now. Automatic sorting and permanent storage are coming in later steps.</Text>
        <OrbitButton disabled={!thought.trim() || !categoryId} onPress={submitThought}>Add to my Orbit</OrbitButton>
      </OrbitSheet>

      <OrbitSheet visible={openCategory !== null} title={selectedCategory?.label ?? 'Your thoughts'} onClose={() => setOpenCategory(null)}>
        <Text style={styles.sheetBody}>{categoryThoughts.length ? `${categoryThoughts.length} ${categoryThoughts.length === 1 ? 'thought is' : 'thoughts are'} taking up space here. You can come back to them one at a time.` : 'A little space for thoughts about this part of your life. Nothing here yet.'}</Text>
        <View style={styles.categoryCalm}>
          <OrbitIcon name="leaf" size={20} color="#477457" />
          <Text style={styles.categoryQuote}>“{previewEncouragement}”</Text>
          <Text style={styles.sheetFootnote}>Preview text. Gemma will generate a fresh, relevant note when connected.</Text>
        </View>
        {categoryThoughts.map((entry) => <View key={entry.id} style={styles.thoughtCard}>
          <Text style={styles.thoughtText}>{entry.text}</Text>
          <Text style={styles.thoughtTime}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>)}
      </OrbitSheet>
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
  universe: { width: '100%', aspectRatio: 340 / 330, marginTop: 22, marginBottom: 12 },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 7, boxShadow: '0px 0px 24px rgba(217, 239, 198, 0.18)' },
  bubbleLabel: { color: '#163A2A', fontWeight: '500', textAlign: 'center' },
  bubbleCount: { fontSize: 11, color: '#3D6046', marginTop: 5 },
  actions: { gap: 16 },
  hint: { textAlign: 'center', color: orbitColors.white, fontSize: 13 },
  calmCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 22, backgroundColor: orbitColors.glass, borderWidth: 1, borderColor: 'rgba(245, 252, 238, 0.25)' },
  calmText: { flex: 1 },
  cardLabel: { fontSize: 12, color: orbitColors.ink, marginBottom: 7 },
  quote: { fontSize: 15, lineHeight: 22, color: '#1C3325' },
  previewLabel: { fontSize: 10, color: orbitColors.muted, marginTop: 9 },
  sessionNote: { fontSize: 10, color: '#234432', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  sheetBody: { color: orbitColors.muted, fontSize: 15, lineHeight: 23 },
  input: { minHeight: 150, maxHeight: 250, borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: '#CDDCC6', color: orbitColors.ink, fontSize: 16, lineHeight: 24 },
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
