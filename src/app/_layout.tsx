import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { OrbitBackground } from '@/components/orbit-art';
import { OrbitProvider } from '@/state/orbit-context';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent', card: '#DCE8DB', primary: '#173F30' } };

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <OrbitProvider>
        <View style={styles.root}>
          <OrbitBackground />
          <StatusBar style="light" />
          <AppTabs />
        </View>
      </OrbitProvider>
    </ThemeProvider>
  );
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#254431' } });
