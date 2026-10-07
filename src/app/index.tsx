import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [thought, setThought] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>ORBIT</Text>
      <Text style={styles.subtitle}>Make space for your mind.</Text>

      <Text style={styles.label}>What’s on your mind?</Text>

      <TextInput
        style={styles.input}
        value={thought}
        onChangeText={setThought}
        placeholder="A sentence, a worry, or a whole thought dump..."
        placeholderTextColor="#737373"
        accessibilityLabel="Your thoughts"
        multiline
        textAlignVertical="top"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FAF9F6',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#242424',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginTop: 8,
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#242424',
    marginBottom: 12,
  },
  input: {
    minHeight: 180,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D5D3CE',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    color: '#242424',
    fontSize: 16,
    lineHeight: 24,
  },
});
