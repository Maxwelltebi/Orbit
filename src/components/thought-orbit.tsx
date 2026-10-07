import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';

import { GlassSphere, OrbitRings } from './orbit-art';
import { orbitColors } from '@/constants/orbit-theme';
import { ORBIT_PERIOD_MS, ORBIT_RADIUS, ORBIT_SIZE, orbitPage, orbitPoint, type OrbitBubble } from '@/services/bubble-layout';
import type { Category } from '@/services/thought-organizer';

function MovingBubble({ bubble, scale, phase, touching, reducedMotion, onOpen }: {
  bubble: OrbitBubble; scale: number; phase: SharedValue<number>; touching: SharedValue<boolean>;
  reducedMotion: boolean; onOpen: (id: string) => void;
}) {
  const distance = useSharedValue(bubble.central ? 0 : ORBIT_RADIUS);
  const angle = useSharedValue(bubble.angle);
  const diameter = useSharedValue(bubble.radius * 2);
  const centralRole = useSharedValue(bubble.central);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const config = { duration: 1100, easing: Easing.inOut(Easing.cubic), reduceMotion: reducedMotion ? ReduceMotion.Always : ReduceMotion.Never };
    const roleChanged = centralRole.get() !== bubble.central;
    centralRole.set(bubble.central);
    // Soften a takeover while the incoming/outgoing bubbles cross the centre.
    if (reducedMotion) opacity.set(1);
    else if (roleChanged) opacity.set(withSequence(ReduceMotion.Never,
      withTiming(0, { duration: 160, reduceMotion: ReduceMotion.Never }),
      withDelay(780, withTiming(1, { duration: 160, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never)));
    else opacity.set(withTiming(1, { duration: 300, reduceMotion: ReduceMotion.Never }));
    distance.set(withTiming(bubble.central ? 0 : ORBIT_RADIUS, config));
    diameter.set(withTiming(bubble.radius * 2, config));
    // Shortest angular path avoids making a bubble sweep a whole circle on a count change.
    if (!bubble.central) angle.set((current) => {
      const difference = Math.atan2(Math.sin(bubble.angle - current), Math.cos(bubble.angle - current));
      return withTiming(current + difference, config);
    });
  }, [angle, bubble.angle, bubble.central, bubble.radius, centralRole, diameter, distance, opacity, reducedMotion]);

  const movement = useAnimatedStyle(() => {
    const point = orbitPoint(angle.get(), distance.get(), phase.get());
    const size = diameter.get() * scale;
    return { width: size, height: size, opacity: opacity.get(), transform: [
      { translateX: point.x * scale - size / 2 }, { translateY: point.y * scale - size / 2 },
    ] };
  });

  return (
    <Animated.View style={[styles.movingBubble, movement]}>
      <Pressable onPress={() => onOpen(bubble.id)} onPressIn={() => touching.set(true)} onPressOut={() => touching.set(false)}
        accessibilityRole="button" testID={`thought-bubble-${bubble.id}`}
        accessibilityLabel={`${bubble.label}, ${bubble.count} ${bubble.count === 1 ? 'thought' : 'thoughts'}. ${bubble.central ? 'Central category.' : 'Orbiting category.'} Open category.`}
        style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><GlassSphere size="100%" /></View>
        <Text style={[styles.label, { fontSize: bubble.central ? 19 : 13 }]} numberOfLines={3}
          adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{bubble.label}</Text>
        <Text style={styles.count}>{bubble.count} {bubble.count === 1 ? 'thought' : 'thoughts'}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ThoughtOrbit({ categories, counts, leaderId, paused, onOpen }: {
  categories: readonly Category[]; counts: ReadonlyMap<string, number>; leaderId: string | null;
  paused: boolean; onOpen: (id: string) => void;
}) {
  const [width, setWidth] = useState(340);
  const [page, setPage] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [appState, setAppState] = useState(AppState.currentState);
  const phase = useSharedValue(0);
  const touching = useSharedValue(false);
  const layout = orbitPage(categories, counts, leaderId, page);
  const scale = width / ORBIT_SIZE;
  const leader = categories.find((category) => category.id === leaderId);
  const moving = !paused && !userPaused && !reducedMotion && (appState === 'active' || appState === null) && layout.bubbles.length > 1;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const stateSubscription = AppState.addEventListener('change', setAppState);
    return () => { mounted = false; motionSubscription.remove(); stateSubscription.remove(); };
  }, []);

  // A shared clock gives the satellites equal speed and keeps their spacing intact.
  // This runs on the native UI thread, without React renders on every animation frame.
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    if (!touching.get() && timeSincePreviousFrame !== null) {
      phase.set((current) => (current + Math.min(timeSincePreviousFrame, 48) * Math.PI * 2 / ORBIT_PERIOD_MS) % (Math.PI * 2));
    }
  }, false);
  useEffect(() => {
    frame.setActive(moving);
    return () => frame.setActive(false);
  }, [frame, moving]);

  return (
    <View style={styles.container}>
      <View testID="thought-orbit-canvas" style={styles.canvas} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><OrbitRings /></View>
        {!categories.length && <View style={styles.empty}>
          <GlassSphere size={104 * scale} />
          <Text style={styles.emptyTitle}>Your orbit starts with one thought.</Text>
          <Text style={styles.emptyBody}>Write freely. Your bubbles will grow from what you share.</Text>
        </View>}
        {layout.bubbles.map((bubble) => <MovingBubble key={bubble.id} bubble={bubble} scale={scale}
          phase={phase} touching={touching} reducedMotion={reducedMotion} onOpen={onOpen} />)}
      </View>
      {leader && <Text style={styles.centreNote} accessibilityLiveRegion="polite">{leader.label} has the most thoughts and holds your centre.</Text>}
      {layout.bubbles.length > 1 && !reducedMotion && <Pressable accessibilityRole="button"
        accessibilityLabel={userPaused ? 'Resume bubble motion' : 'Pause bubble motion'}
        onPress={() => setUserPaused((value) => !value)} style={styles.motionButton}>
        <Text style={styles.controlText}>{userPaused ? 'Resume motion' : 'Pause motion'}</Text>
      </Pressable>}
      {layout.pageCount > 1 && <View style={styles.pager}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous orbit group" disabled={layout.page === 0}
          onPress={() => setPage(layout.page - 1)} style={[styles.pageButton, layout.page === 0 && styles.disabled]}>
          <Text style={styles.controlText}>Previous</Text>
        </Pressable>
        <Text style={styles.pageCount}>Bubbles {layout.page + 1} of {layout.pageCount}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next orbit group" disabled={layout.page === layout.pageCount - 1}
          onPress={() => setPage(layout.page + 1)} style={[styles.pageButton, layout.page === layout.pageCount - 1 && styles.disabled]}>
          <Text style={styles.controlText}>Next</Text>
        </Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 22, marginBottom: 12, gap: 4 },
  canvas: { width: '100%', aspectRatio: 1 },
  movingBubble: { position: 'absolute', top: 0, left: 0 },
  bubble: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', padding: 6,
    boxShadow: '0px 0px 24px rgba(217, 239, 198, 0.18)' },
  label: { color: '#163A2A', fontWeight: '500', textAlign: 'center' },
  count: { fontSize: 10, color: '#3D6046', marginTop: 4 },
  pressed: { opacity: 0.8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 19, color: orbitColors.white, textAlign: 'center', fontWeight: '500' },
  emptyBody: { fontSize: 14, lineHeight: 21, color: '#E2ECDD', textAlign: 'center' },
  centreNote: { fontSize: 12, lineHeight: 18, color: '#E2ECDD', textAlign: 'center' },
  motionButton: { minHeight: 44, alignSelf: 'center', paddingHorizontal: 18, justifyContent: 'center' },
  controlText: { fontSize: 12, color: orbitColors.white, textAlign: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(20, 55, 38, 0.45)' },
  pageCount: { fontSize: 12, color: '#E2ECDD' },
  disabled: { opacity: 0.4 },
});
