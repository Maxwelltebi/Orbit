import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitIcon, type OrbitIconName } from './orbit-art';
import { orbitColors } from '@/constants/orbit-theme';

export function OrbitButton({ children, onPress, disabled = false, icon, style }: {
  children: string; onPress: () => void; disabled?: boolean;
  icon?: OrbitIconName; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, style, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      <LinearGradient colors={['#214F3B', '#123426']} start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.buttonFill}>
        {icon && <OrbitIcon name={icon} color={orbitColors.white} size={22} />}
        <Text style={styles.buttonText}>{children}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function OrbitSheet({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close dialog" />
        <View style={[styles.sheet, { marginTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <OrbitIcon name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 28, overflow: 'hidden', minHeight: 48 },
  buttonFill: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { fontSize: 16, fontWeight: '600', color: orbitColors.white },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 28, 19, 0.55)' },
  sheet: { backgroundColor: '#EDF3E8', borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '85%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  handle: { height: 4, width: 38, borderRadius: 2, backgroundColor: '#AFBEAB', alignSelf: 'center', marginTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 14, paddingTop: 8 },
  sheetTitle: { flex: 1, fontSize: 26, fontWeight: '600', color: orbitColors.ink },
  close: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  sheetContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 16 },
});
