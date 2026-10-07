import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { OrbitBackground, OrbitIcon } from './orbit-art';
import { OrbitButton } from './orbit-ui';

export function StorageGate({ failed, onRetry, message }: { failed: boolean; onRetry: () => void; message?: string }) {
  return (
    <View style={styles.screen}>
      <OrbitBackground />
      <View style={styles.card}>
        <OrbitIcon name="orbit" size={52} color="#EFF7E8" />
        <Text style={styles.title} accessibilityRole="header">{failed ? 'A moment to reconnect' : 'Opening your Orbit'}</Text>
        <Text style={styles.body} accessibilityLiveRegion="polite">{message ?? (failed ? 'We could not open your saved thoughts. Please try again.' : 'Bringing your thoughts back into view.')}</Text>
        {failed ? <OrbitButton onPress={onRetry}>Try again</OrbitButton>
          : <ActivityIndicator size="large" color="#E2ECDD" accessibilityLabel="Loading saved thoughts" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#254431', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 20 },
  title: { color: '#F8FCF3', fontSize: 26, fontWeight: '600', textAlign: 'center' },
  body: { color: '#E2ECDD', fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 8 },
});
