import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitIcon } from './orbit-art';
import { orbitColors } from '@/constants/orbit-theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function OrbitTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.position, { bottom: Math.max(insets.bottom, 12) + 4, left: insets.left + 20, right: insets.right + 20 }]}>
      <View style={styles.bar}>
        {state.routes.filter((route) => route.name === 'index' || route.name === 'profile').map((route) => {
          const focused = state.routes[state.index].key === route.key;
          const title = descriptors[route.key].options.title ?? route.name;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={title}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.tab, focused && styles.active, pressed && styles.pressed]}>
              <OrbitIcon name={route.name === 'index' ? 'orbit' : 'person'} size={25}
                color={focused ? orbitColors.ink : '#608373'} />
              <Text style={[styles.label, { color: focused ? orbitColors.ink : '#486859' }]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs tabBar={(props) => <OrbitTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
      <Tabs.Screen name="index" options={{ title: 'My Orbit' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', alignItems: 'center' },
  bar: { flexDirection: 'row', width: '100%', maxWidth: 440, padding: 4, borderRadius: 34, backgroundColor: 'rgba(225, 239, 221, 0.65)', borderWidth: 1, borderColor: 'rgba(246, 255, 240, 0.25)' },
  tab: { flex: 1, minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, borderRadius: 28 },
  active: { backgroundColor: 'rgba(245, 250, 241, 0.82)' },
  label: { fontSize: 14, fontWeight: '500' },
  pressed: { opacity: 0.7 },
});
