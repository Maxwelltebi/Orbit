import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import OrbitNavigation from '@/components/orbit-navigation';
import { OrbitBackground } from '@/components/orbit-art';
import { OrbitProvider } from '@/state/orbit-context';

const pageBackground = '#254431';
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: pageBackground, card: '#DCE8DB', primary: '#173F30' } };

function OrbitScene({ children, headerHeight }: { children: ReactNode; headerHeight: number }) {
  return (
    <View style={styles.scene}>
      {/* Each screen covers the previous one; align its artwork with the shared header. */}
      <OrbitBackground style={{ top: -headerHeight }} />
      {children}
    </View>
  );
}

export default function RootLayout() {
  const [headerHeight, setHeaderHeight] = useState(0);
  return (
    <ThemeProvider value={theme}>
      <OrbitProvider>
        <View style={styles.root}>
          <OrbitBackground />
          <StatusBar style="light" />
          <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <OrbitNavigation />
          </View>
          <Stack
            screenLayout={({ children }) => <OrbitScene headerHeight={headerHeight}>{children}</OrbitScene>}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: pageBackground },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="profile" />
          </Stack>
        </View>
      </OrbitProvider>
    </ThemeProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pageBackground },
  scene: { flex: 1, backgroundColor: pageBackground, overflow: 'hidden' },
});
