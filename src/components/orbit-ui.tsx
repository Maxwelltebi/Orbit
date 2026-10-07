import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
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

export function OrbitDialog({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  function closeDialog() {
    Keyboard.dismiss();
    onClose();
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeDialog} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} accessibilityRole="button" accessibilityLabel="Close dialog" />
        <View pointerEvents="box-none" style={[styles.dialogPosition, {
          paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 20, paddingRight: insets.right + 20,
        }]}>
        <View style={styles.dialog} accessibilityViewIsModal role="dialog" accessibilityLabel={title}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle} accessibilityRole="header">{title}</Text>
            <Pressable onPress={closeDialog} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <OrbitIcon name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView style={styles.dialogScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator contentContainerStyle={styles.dialogContent}>
            {children}
          </ScrollView>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 28, overflow: 'hidden', minHeight: 48 },
  buttonFill: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { fontSize: 16, fontWeight: '600', color: orbitColors.white },
  modal: { flex: 1, backgroundColor: 'rgba(8, 28, 19, 0.72)' },
  dialogPosition: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialog: { backgroundColor: '#EDF3E8', borderRadius: 28, maxHeight: '100%', flexShrink: 1, width: '100%', maxWidth: 520, paddingBottom: 12, borderWidth: 1, borderColor: '#CBDAC3', boxShadow: '0px 20px 60px rgba(8, 28, 19, 0.35)' },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 12, paddingTop: 14 },
  dialogTitle: { flex: 1, fontSize: 25, fontWeight: '600', color: orbitColors.ink },
  close: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 16 },
});
