import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitButton } from '@/components/orbit-ui';
import { orbitColors } from '@/constants/orbit-theme';
import { checkAiRuntime } from '@/services/ai-runtime-check';
import type { RuntimeCheck } from '@/services/ai-runtime-types';
import { readSorterReply, sorterCategories, sorterEntryLimit } from '@/services/orbit-bubbles';
import { listSorterModels, sorterTester, type SorterModel } from '@/services/orbit-sorter-test';

function readModels(): { models: SorterModel[]; error: string } {
  try {
    return { models: listSorterModels(), error: '' };
  } catch (error) {
    return { models: [], error: error instanceof Error ? error.message : 'Could not list the models on this device.' };
  }
}

function memorySize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unavailable';
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : Math.round(bytes / 1024 ** 2) + ' MiB';
}

export default function AiScreen() {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RuntimeCheck | null>(null);
  const [{ models, error: modelError }, setModelList] = useState(readModels);
  const [chosenModel, setSelectedModel] = useState('');
  // Default to the newest model, and drop a choice whose file is no longer on the device.
  const selectedModel = models.some((model) => model.fileName === chosenModel) ? chosenModel : models[0]?.fileName ?? '';
  const [entry, setEntry] = useState('');
  const test = useSyncExternalStore(sorterTester.subscribe, sorterTester.getState, sorterTester.getState);
  const report = test.result?.request ? readSorterReply(test.result.request.entry, test.result.response) : null;
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') sorterTester.cancel();
    });
    const session = generation;
    return () => {
      session.current++;
      appState.remove();
      sorterTester.cancel();
    };
  }, []);

  async function runCheck() {
    if (pending.current || sorterTester.getState().busy) return;
    pending.current = true;
    const request = generation.current;
    setChecking(true);
    setResult(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        checkAiRuntime(),
        new Promise<RuntimeCheck>((resolve) => {
          timer = setTimeout(() => resolve({ status: 'error', message: 'The check took too long. Reload ORBIT and try again.' }), 10000);
        }),
      ]);
      if (request === generation.current) {
        setResult(outcome);
        setModelList(readModels());
      }
    } finally {
      if (timer) clearTimeout(timer);
      pending.current = false;
      if (request === generation.current) setChecking(false);
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">On-device AI</Text>
        <Text style={styles.subtitle}>A little intelligence, right here.</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>First, check your device</Text>
          <Text style={styles.body}>Check that the AI runtime responds and see how much memory is available. This check does not load a model or send your thoughts anywhere.</Text>
          <OrbitButton disabled={checking || test.busy} style={styles.button} onPress={runCheck}>{checking ? 'Checking runtime...' : result ? 'Check again' : 'Check runtime'}</OrbitButton>
          <View accessibilityLiveRegion="polite">
            {checking && <Text style={styles.note}>Reading available memory...</Text>}
            {result?.status === 'ready' && (
              <View style={styles.result}>
                <Text style={styles.heading}>Runtime ready</Text>
                <Text style={styles.body}>The native AI runtime responded successfully.</Text>
                <View style={styles.reading}><Text style={styles.label}>Device</Text><Text style={styles.value}>{Platform.OS === 'android' ? 'Android' : 'iOS'}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Available RAM</Text><Text style={styles.value}>{memorySize(result.availableMemoryBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>ORBIT memory usage</Text><Text style={styles.value}>{memorySize(result.residentBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Model files on device</Text><Text style={styles.value}>{result.cachedModelCount}</Text></View>
                <Text style={styles.note}>Measured at {new Date(result.checkedAt).toLocaleTimeString()}. Available memory changes as other apps run.</Text>
                {result.isLowMemory && <Text style={styles.error}>Your device reports low memory. Close other apps before testing a model.</Text>}
              </View>
            )}
            {result && result.status !== 'ready' && (
              <View style={styles.result}>
                <Text style={styles.heading}>{result.status === 'unavailable' ? 'Development app needed' : 'Check could not finish'}</Text>
                <Text selectable style={styles.error}>{result.message}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Test the fine-tuned sorter</Text>
          <Text style={styles.body}>Our fine-tuned Gemma 3 270M reads a whole journal entry and returns bubbles made of your exact words.</Text>
          <Text style={styles.note}>{sorterCategories.length} categories: {sorterCategories.join(', ')}.</Text>

          <Text style={styles.label}>Model</Text>
          {modelError ? <Text selectable style={styles.error}>{modelError}</Text>
            : !models.length ? <Text style={styles.error}>No sorter model found. Copy an orbit-sorter-*.litertlm file into ORBIT with adb, then check again.</Text>
            : (
              <View accessibilityRole="radiogroup" style={styles.models}>
                {models.map((model) => {
                  const selected = model.fileName === selectedModel;
                  return (
                    <Pressable key={model.fileName} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: test.busy }} disabled={test.busy}
                      onPress={() => setSelectedModel(model.fileName)} style={[styles.model, selected && styles.modelSelected]}>
                      <Text style={styles.value}>{model.fileName.replace(/^orbit-sorter-|\.litertlm$/g, '')}</Text>
                      <Text style={styles.note}>{memorySize(model.sizeBytes)} - copied {new Date(model.lastModifiedMs).toLocaleDateString()}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

          <TextInput accessibilityLabel="Journal entry to sort" placeholder="Write an entry the way you would on a busy day..." placeholderTextColor={orbitColors.muted}
            multiline textAlignVertical="top" style={styles.input} value={entry} onChangeText={setEntry}
            maxLength={sorterEntryLimit} editable={!checking && !test.busy} />
          <Text style={styles.note}>{entry.length}/{sorterEntryLimit} characters. Test text stays on this device and is not saved to your journal.</Text>
          <OrbitButton disabled={checking || test.busy || !entry.trim() || !selectedModel} style={styles.button} onPress={() => {
            if (pending.current) return;
            Keyboard.dismiss();
            void sorterTester.start({ entry, model: selectedModel });
          }}>
            {test.busy ? test.phase === 'loading' ? 'Loading model...' : test.phase === 'generating' ? 'Sorting your entry...' : 'Finishing test...' : 'Sort my entry'}
          </OrbitButton>
        </View>

        {test.phase !== 'idle' && <View style={styles.card}>
          <Text style={styles.heading}>Sorting result</Text>
          <View accessibilityLiveRegion="polite" style={styles.output}>
            {test.phase === 'loading' && <Text style={styles.note}>Loading the model. The test has a two-minute time limit.</Text>}
            {test.phase === 'generating' && <Text style={styles.note}>Sorting on this device...</Text>}
            {test.phase === 'releasing' && <Text style={styles.note}>Finishing and releasing the model...</Text>}
            {test.phase === 'error' && <Text selectable style={styles.error}>{test.message}</Text>}
            {test.phase === 'ready' && test.result && report && (
              <View style={styles.output}>
                <Text style={styles.note}>Model: {test.result.request?.model}</Text>
                {report.status === 'invalid' ? <Text selectable style={styles.error}>{report.message}</Text> : (
                  <>
                    <Text style={styles.body}>{report.bubbles.length} {report.bubbles.length === 1 ? 'bubble' : 'bubbles'}</Text>
                    {report.bubbles.map((bubble) => (
                      <View key={bubble.category} style={styles.bubble}>
                        <Text style={styles.value}>{bubble.category}</Text>
                        {bubble.texts.map((text, index) => <Text key={index} selectable style={styles.body}>{text}</Text>)}
                      </View>
                    ))}
                    {report.repaired
                      ? <Text style={styles.error}>The raw reply broke a rule ({report.problem}). It was repaired on this device.</Text>
                      : <Text style={styles.note}>The raw reply followed every rule; no repair was needed.</Text>}
                  </>
                )}
                <Text style={styles.label}>Raw model reply</Text>
                <Text selectable style={styles.rawResponse}>{report.raw}</Text>
                <View style={styles.reading}><Text style={styles.label}>Total, including cleanup</Text><Text style={styles.value}>{(test.result.totalMs / 1000).toFixed(1)} s</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Model load</Text><Text style={styles.value}>{(test.result.loadMs / 1000).toFixed(1)} s</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Generation</Text><Text style={styles.value}>{(test.result.generationMs / 1000).toFixed(1)} s</Text></View>
                {test.result.firstTokenMs !== null && <View style={styles.reading}><Text style={styles.label}>First response token</Text><Text style={styles.value}>{(test.result.firstTokenMs / 1000).toFixed(1)} s</Text></View>}
                <View style={styles.reading}><Text style={styles.label}>ORBIT memory after load</Text><Text style={styles.value}>{memorySize(test.result.loadedMemory.residentBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>ORBIT memory after response</Text><Text style={styles.value}>{memorySize(test.result.generatedMemory.residentBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Available RAM after response</Text><Text style={styles.value}>{memorySize(test.result.generatedMemory.availableMemoryBytes)}</Text></View>
                <Text style={styles.note}>Check whether each bubble fits. Nothing has been saved, and the model has been unloaded. Memory readings are snapshots, not peak usage.</Text>
              </View>
            )}
          </View>
        </View>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 20 },
  title: { fontSize: 38, fontWeight: '600', letterSpacing: -1.2, color: orbitColors.white },
  subtitle: { fontSize: 17, color: '#E2ECDD', marginTop: -15, marginBottom: 6 },
  card: { padding: 24, borderRadius: 28, backgroundColor: orbitColors.glass, borderWidth: 1, borderColor: 'rgba(245,252,238,0.25)', gap: 12 },
  heading: { fontSize: 21, fontWeight: '600', color: orbitColors.ink },
  body: { fontSize: 15, lineHeight: 23, color: orbitColors.ink },
  button: { marginTop: 8 },
  result: { gap: 12, paddingTop: 20 },
  output: { gap: 12 },
  models: { gap: 8 },
  model: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#AABDAA', backgroundColor: 'rgba(255,255,255,0.35)', gap: 2 },
  modelSelected: { borderColor: orbitColors.ink, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  input: { height: 156, fontSize: 16, lineHeight: 24, color: orbitColors.ink, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: '#AABDAA', borderRadius: 16, padding: 14 },
  bubble: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AABDAA' },
  rawResponse: { fontSize: 13, lineHeight: 20, color: orbitColors.muted },
  reading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AABDAA', paddingBottom: 10 },
  label: { fontSize: 14, color: orbitColors.muted },
  value: { fontSize: 15, fontWeight: '600', color: orbitColors.ink },
  note: { fontSize: 13, lineHeight: 20, color: orbitColors.muted },
  error: { fontSize: 14, lineHeight: 22, color: '#7A3025' },
});
