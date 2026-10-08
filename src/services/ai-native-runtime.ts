import { Platform, TurboModuleRegistry } from 'react-native';

// A guarded require preserves Nitro's live exports and keeps Expo Go usable.
export function getNativeAi() {
  if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !TurboModuleRegistry.get('NitroModules')) {
    throw new Error('Open the installed ORBIT development app. The AI runtime is not included in Expo Go.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native code must load only after the capability check.
  const { NitroModules } = require('react-native-nitro-modules') as typeof import('react-native-nitro-modules');
  if (!NitroModules || typeof NitroModules.hasHybridObject !== 'function') {
    throw new Error('The Nitro JavaScript API did not load. Reload ORBIT and check again.');
  }
  if (!NitroModules.hasHybridObject('LiteRTLM') || !NitroModules.hasHybridObject('ModelStore')) {
    throw new Error('This installed app does not include the complete AI runtime. Use the latest ORBIT development build.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- LiteRT evaluates native code when loaded.
  const api = require('react-native-litert-lm') as typeof import('react-native-litert-lm');
  if (typeof api.createLLM !== 'function' || typeof api.ModelRegistry?.listCachedFiles !== 'function') {
    throw new Error('The LiteRT JavaScript API did not load. Reload ORBIT and check again.');
  }
  return api;
}
