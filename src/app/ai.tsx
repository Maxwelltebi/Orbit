import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitButton } from '@/components/orbit-ui';
import { orbitColors } from '@/constants/orbit-theme';
import { checkAiRuntime } from '@/services/ai-runtime-check';
import type { RuntimeCheck } from '@/services/ai-runtime-types';
import { customSortingLimit, reviewCustomSorting } from '@/services/custom-sorting-test';
import { gemmaTester } from '@/services/gemma-test';
import { categoryTestText, evaluateCategoryTest, categoryCatalogueCount, categoryTestRequest } from '@/services/gemma-category-test';

function memorySize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unavailable';
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : Math.round(bytes / 1024 ** 2) + ' MiB';
}

export default function AiScreen() {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [customText, setCustomText] = useState('');
  const [result, setResult] = useState<RuntimeCheck | null>(null);
  const test = useSyncExternalStore(gemmaTester.subscribe, gemmaTester.getState, gemmaTester.getState);
  const categoryReport = test.result && (test.result.kind === 'categories' || test.result.kind === 'hybrid') ? evaluateCategoryTest(test.result.response, test.result.routing?.localIds) : null;
  const customReport = test.result?.kind === 'custom' ? reviewCustomSorting(test.result.source ?? '', test.result.response, test.result.routing?.localIds) : null;
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') gemmaTester.cancel();
    });
    const session = generation;
    return () => {
      session.current++;
      appState.remove();
      gemmaTester.cancel();
    };
  }, []);

  async function runCheck() {
    if (pending.current || gemmaTester.getState().busy) return;
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
      if (request === generation.current) setResult(outcome);
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
          <Text style={styles.body}>Check that the AI runtime responds and see how much memory is available. This check does not download a model or send your thoughts anywhere.</Text>
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
                <View style={styles.reading}><Text style={styles.label}>Cached model files</Text><Text style={styles.value}>{result.cachedModelCount}</Text></View>
                <Text style={styles.note}>Measured at {new Date(result.checkedAt).toLocaleTimeString()}. Available memory changes as other apps run.</Text>
                {result.isLowMemory && <Text style={styles.error}>Your device reports low memory. Close other apps before testing a model.</Text>}
                <Text style={styles.note}>This confirms the runtime connection. Next, test the downloaded model before using it to organise your thoughts.</Text>
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
          <Text style={styles.heading}>Test Gemma</Text>
          <Text style={styles.body}>Gemma 3 270M will generate one short encouraging sentence using the model saved on this device. Keep ORBIT open during the test.</Text>
          <Text style={styles.note}>Nothing is downloaded or sent online. Your saved thoughts are not used in this test.</Text>
          <OrbitButton disabled={checking || test.busy} style={styles.button} onPress={() => { if (!pending.current) void gemmaTester.start('encouragement'); }}>
            {test.busy && test.kind === 'encouragement' ? test.phase === 'loading' ? 'Loading Gemma...' : test.phase === 'generating' ? 'Generating...' : 'Finishing test...' : 'Test Gemma'}
          </OrbitButton>
          <Text style={styles.note}>Thought sorting still uses the preview organiser. Test categories below to check the next model capability.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Test categories</Text>
          <Text style={styles.body}>Check six sample thoughts using a broad catalogue. Local retrieval offers a few choices per sentence; Gemma selects only category IDs.</Text>
          <Text style={styles.note}>{categoryCatalogueCount} available categories, including Other. No category names can be invented.</Text>
          <Text selectable style={styles.sample}>{categoryTestText}</Text>
          <Text style={styles.note}>This sample is not saved to your journal. Keep ORBIT open while the test runs.</Text>
          <OrbitButton disabled={checking || test.busy} style={styles.button} onPress={() => { if (!pending.current) void gemmaTester.start('categories'); }}>
            {test.busy && test.kind === 'categories' ? test.phase === 'loading' ? 'Loading Gemma...' : test.phase === 'generating' ? 'Sorting sample...' : 'Finishing test...' : 'Test categories'}
          </OrbitButton>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Test fast sorting</Text>
          <Text style={styles.body}>Clear topic matches are sorted locally. Only thoughts with competing or unclear topics go to Gemma.</Text>
          <Text style={styles.note}>Uses the same six thoughts. Results show Local match or Gemma for every sentence. Local results do not count as model accuracy.</Text>
          <OrbitButton disabled={checking || test.busy} style={styles.button} onPress={() => { if (!pending.current) void gemmaTester.start('hybrid'); }}>
            {test.busy && test.kind === 'hybrid' ? test.phase === 'loading' ? 'Preparing sorting...' : 'Sorting...' : 'Test fast sorting'}
          </OrbitButton>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Try your own thoughts</Text>
          <Text style={styles.body}>Write a few sentences about different things on your mind. Review how each sentence is sorted.</Text>
          <TextInput accessibilityLabel="Thoughts to test" placeholder="Write a few thoughts here..." placeholderTextColor={orbitColors.muted}
            multiline textAlignVertical="top" style={styles.input} value={customText} onChangeText={setCustomText}
            maxLength={customSortingLimit} editable={!checking && !test.busy} />
          <Text style={styles.note}>{customText.length}/{customSortingLimit} characters. Test text stays on this device and is not saved to your journal.</Text>
          <OrbitButton disabled={checking || test.busy || !customText.trim()} style={styles.button} onPress={() => {
            if (pending.current) return;
            Keyboard.dismiss();
            void gemmaTester.start('custom', customText);
          }}>
            {test.busy && test.kind === 'custom' ? 'Sorting your thoughts...' : 'Sort my test thoughts'}
          </OrbitButton>
        </View>
        {test.phase !== 'idle' && <View style={styles.card}>
          <Text style={styles.heading}>{test.kind === 'custom' ? 'Your sorting result' : test.kind === 'hybrid' ? 'Fast sorting result' : test.kind === 'categories' ? 'Category test result' : 'Response test result'}</Text>
          <View accessibilityLiveRegion="polite" style={styles.testOutput}>
            {test.phase === 'loading' && <Text style={styles.note}>The first load may take a little longer. The test has a two-minute time limit.</Text>}
            {test.phase === 'generating' && <Text style={styles.note}>Sorting on this device...</Text>}
            {test.phase === 'releasing' && <Text style={styles.note}>Finishing and releasing any loaded model...</Text>}
            {test.phase === 'error' && <Text selectable style={styles.error}>{test.message}</Text>}
            {test.phase === 'ready' && test.result && (
              <View style={styles.testOutput}>
                {customReport ? (
                  customReport.status === 'invalid' ? <Text selectable style={styles.error}>The sorting response was not usable: {customReport.message}</Text> : (
                    <View style={styles.testOutput}>
                      <Text style={styles.body}>{customReport.localCount} local matches; {customReport.modelCount} Gemma choices.</Text>
                      {customReport.items.map((item) => (
                        <View key={item.id} style={styles.assignment}>
                          <Text selectable style={styles.body}>{item.text}</Text>
                          <Text style={styles.label}>{item.method === 'local' ? 'Local match' : 'Gemma'}</Text>
                          <Text style={styles.value}>{item.category}</Text>
                          {item.competingTopics.length > 1 ? (
                            <Text style={styles.error}>Several topic matches: {item.competingTopics.join(', ')}. Review this thought; one category may not cover it.</Text>
                          ) : item.needsReview && <Text style={styles.error}>No specific category was chosen. Please review this thought.</Text>}
                        </View>
                      ))}
                      <Text style={styles.note}>Check whether each category fits. Local rules and Gemma can both make mistakes. These choices have not been saved.</Text>
                    </View>
                  )
                ) : categoryReport ? (
                  categoryReport.status === 'invalid' ? <Text selectable style={styles.error}>The category response was not usable: {categoryReport.message}</Text> : (
                    <View style={styles.testOutput}>
                      <Text style={styles.heading}>{categoryReport.topicMatches}/{categoryReport.total} overall topic checks matched</Text>
                      <Text style={styles.body}>{categoryReport.localCount} local matches; {categoryReport.modelCount} Gemma choices.</Text>
                      {categoryReport.modelCount > 0 && <Text style={styles.note}>Gemma-only checks: {categoryReport.modelMatches}/{categoryReport.modelCount} matched.</Text>}
                      {categoryReport.items.map((item) => (
                        <View key={item.id} style={styles.assignment}>
                          <Text style={styles.body}>{item.text}</Text>
                          <Text style={styles.label}>{item.method === 'local' ? 'Local match' : 'Gemma'}</Text>
                          <Text style={styles.value}>{item.category} - {item.isNew ? 'Would add a bubble' : 'Would reuse a bubble'}</Text>
                          {!item.topicMatched && <Text style={styles.error}>Topic needs review. Expected: {item.expected}</Text>}
                        </View>
                      ))}
                      <Text style={styles.note}>Overall checks include local matching and Gemma. An overall improvement does not establish better model accuracy. This sample is not saved; broader testing is still needed.</Text>
                    </View>
                  )
                ) : <Text selectable style={styles.body}>{test.result.response}</Text>}
                {categoryReport && !test.result.routing && <><Text style={styles.note}>This batch offers {categoryTestRequest.offeredCategoryCount} of {categoryCatalogueCount} categories. Prompt: {categoryTestRequest.prompt.length} characters. Response: {test.result.response.length} characters.</Text><Text style={styles.label}>Raw category IDs</Text><Text selectable style={styles.rawResponse}>{test.result.response}</Text></>}
                {test.result.routing && <View style={styles.testOutput}>
                  <Text style={styles.note}>Local preparation: {test.result.routing.preparationMs.toFixed(1)} ms. Model input: {test.result.routing.promptCharacters} characters across {test.result.routing.modelIds.length} items.</Text>
                  <Text style={styles.label}>Combined category IDs (local and model)</Text>
                  <Text selectable style={styles.rawResponse}>{test.result.response}</Text>
                </View>}
                <View style={styles.reading}><Text style={styles.label}>Total test, including cleanup</Text><Text style={styles.value}>{(test.result.totalMs / 1000).toFixed(1)} s</Text></View>
                {!test.result.usedModel && <Text style={styles.note}>No model was needed for these thoughts.</Text>}
                {test.result.usedModel && <>
                <View style={styles.reading}><Text style={styles.label}>Model load</Text><Text style={styles.value}>{(test.result.loadMs / 1000).toFixed(1)} s</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Generation</Text><Text style={styles.value}>{(test.result.generationMs / 1000).toFixed(1)} s</Text></View>
                {test.result.firstTokenMs !== null && <View style={styles.reading}><Text style={styles.label}>First response token</Text><Text style={styles.value}>{(test.result.firstTokenMs / 1000).toFixed(1)} s</Text></View>}
                <View style={styles.reading}><Text style={styles.label}>ORBIT memory after load</Text><Text style={styles.value}>{memorySize(test.result.loadedMemory.residentBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>ORBIT memory after response</Text><Text style={styles.value}>{memorySize(test.result.generatedMemory.residentBytes)}</Text></View>
                <View style={styles.reading}><Text style={styles.label}>Available RAM after response</Text><Text style={styles.value}>{memorySize(test.result.generatedMemory.availableMemoryBytes)}</Text></View>
                <Text style={styles.note}>The model has been unloaded. Memory readings are snapshots, not peak usage.</Text>
                </>}
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
  testOutput: { gap: 12 },
  sample: { fontSize: 15, lineHeight: 23, color: orbitColors.ink, backgroundColor: 'rgba(255,255,255,0.4)', padding: 14, borderRadius: 16 },
  input: { height: 156, fontSize: 16, lineHeight: 24, color: orbitColors.ink, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: '#AABDAA', borderRadius: 16, padding: 14 },
  assignment: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AABDAA' },
  rawResponse: { fontSize: 13, lineHeight: 20, color: orbitColors.muted },
  reading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AABDAA', paddingBottom: 10 },
  label: { fontSize: 14, color: orbitColors.muted },
  value: { fontSize: 15, fontWeight: '600', color: orbitColors.ink },
  note: { fontSize: 13, lineHeight: 20, color: orbitColors.muted },
  error: { fontSize: 14, lineHeight: 22, color: '#7A3025' },
});
