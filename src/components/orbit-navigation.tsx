import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitIcon, type OrbitIconName } from './orbit-art';
import { orbitColors } from '@/constants/orbit-theme';
import { useLogin } from '@/state/login-context';

// Add future pages here; the menu and shared Back control stay consistent.
const pages: { href: Href; title: string; icon: OrbitIconName }[] = [
  { href: '/', title: 'My Orbit', icon: 'orbit' },
  { href: '/profile', title: 'Profile', icon: 'person' },
];

export default function OrbitNavigation() {
  const { lock } = useLogin();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === '/';

  function goBack() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function navigate(href: Href) {
    setMenuOpen(false);
    Keyboard.dismiss();
    if (href !== pathname) router.navigate(href);
  }

  return (
    <>
      <View style={[styles.header, {
        paddingTop: insets.top + 8,
        paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20,
      }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu"
          accessibilityState={{ expanded: menuOpen }} onPress={() => { Keyboard.dismiss(); setMenuOpen(true); }}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
          <OrbitIcon name="menu" color={orbitColors.white} size={24} />
        </Pressable>
        {!isHome && (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <OrbitIcon name="back" color={orbitColors.white} size={21} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        )}
        <View style={styles.brand}>
          <OrbitIcon name="orbit" color={orbitColors.white} size={22} />
          <Text style={styles.brandText}>Orbit</Text>
        </View>
      </View>

      <Modal visible={menuOpen} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
        onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuOverlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close navigation menu"
            onPress={() => setMenuOpen(false)} />
          <View style={[styles.drawer, {
            width: Math.min(width - 48, 340),
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 24,
          }]} accessibilityViewIsModal role="dialog" accessibilityLabel="Navigation menu">
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrand}>
                <OrbitIcon name="orbit" color={orbitColors.ink} size={32} />
                <Text style={styles.drawerTitle}>Orbit</Text>
              </View>
              <Pressable style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close menu"
                onPress={() => setMenuOpen(false)}>
                <OrbitIcon name="close" size={22} />
              </Pressable>
            </View>
            <Text style={styles.tagline}>A little space for your thoughts.</Text>
            <ScrollView contentContainerStyle={styles.links}>
              {pages.map((page) => {
                const selected = page.href === pathname;
                return (
                  <Pressable key={String(page.href)} accessibilityRole="button" accessibilityLabel={page.title}
                    accessibilityState={{ selected }} onPress={() => navigate(page.href)}
                    style={({ pressed }) => [styles.link, selected && styles.selectedLink, pressed && styles.pressed]}>
                    <OrbitIcon name={page.icon} size={26} color={selected ? orbitColors.white : orbitColors.ink} />
                    <Text style={[styles.linkText, selected && styles.selectedText]}>{page.title}</Text>
                    <OrbitIcon name="arrow" size={19} color={selected ? orbitColors.white : orbitColors.ink} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="Lock Orbit" onPress={() => {
              setMenuOpen(false); Keyboard.dismiss(); lock();
            }} style={styles.link}>
              <OrbitIcon name="lock" size={24} />
              <Text style={styles.linkText}>Lock Orbit</Text>
            </Pressable>
            <Text style={styles.footer}>Your space. Your local login.</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, gap: 10 },
  menuButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(235, 245, 226, 0.13)', alignItems: 'center', justifyContent: 'center' },
  backButton: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLabel: { color: orbitColors.white, fontSize: 15 },
  pressed: { opacity: 0.7 },
  brand: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { color: orbitColors.white, fontSize: 18, fontWeight: '600' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(8, 28, 19, 0.7)' },
  drawer: { height: '100%', backgroundColor: '#E9F1E2', paddingHorizontal: 20, borderTopRightRadius: 28, borderBottomRightRadius: 28 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  drawerTitle: { fontSize: 28, fontWeight: '600', color: orbitColors.ink },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  tagline: { color: orbitColors.muted, fontSize: 13, marginTop: 10 },
  links: { gap: 10, paddingTop: 32, paddingBottom: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 18 },
  selectedLink: { backgroundColor: orbitColors.forest },
  linkText: { flex: 1, fontSize: 16, color: orbitColors.ink, fontWeight: '500' },
  selectedText: { color: orbitColors.white },
  footer: { fontSize: 12, color: orbitColors.muted, marginTop: 20, paddingBottom: 8 },
});
