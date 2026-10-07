import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

export function OrbitBackground({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`${id}-base`} cx="20%" cy="92%" r="100%">
            <Stop offset="0" stopColor="#BCD8B4" />
            <Stop offset="0.43" stopColor="#7EAB83" />
            <Stop offset="1" stopColor="#254431" />
          </RadialGradient>
          <RadialGradient id={`${id}-light`}>
            <Stop offset="0" stopColor="#CAE4BD" stopOpacity="0.65" />
            <Stop offset="1" stopColor="#CAE4BD" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}-shade`}>
            <Stop offset="0" stopColor="#102E23" stopOpacity="0.65" />
            <Stop offset="1" stopColor="#102E23" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="400" height="850" fill={`url(#${id}-base)`} />
        <Ellipse cx="365" cy="90" rx="210" ry="300" fill={`url(#${id}-light)`} />
        <Ellipse cx="82" cy="325" rx="270" ry="210" fill={`url(#${id}-shade)`} />
        <Ellipse cx="130" cy="615" rx="230" ry="220" fill={`url(#${id}-light)`} />
        <Ellipse cx="370" cy="480" rx="190" ry="220" fill={`url(#${id}-shade)`} />
      </Svg>
    </View>
  );
}

export function GlassSphere({ size }: { size: number | string }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-sphere`} cx="32%" cy="22%" r="82%">
          <Stop offset="0" stopColor="#E7F2E2" stopOpacity="0.98" />
          <Stop offset="0.45" stopColor="#C4DCC3" stopOpacity="0.94" />
          <Stop offset="0.78" stopColor="#9DBE9E" stopOpacity="0.93" />
          <Stop offset="1" stopColor="#D2E8CF" stopOpacity="0.98" />
        </RadialGradient>
        <RadialGradient id={`${id}-highlight`} cx="34%" cy="19%" r="62%">
          <Stop offset="0" stopColor="white" stopOpacity="0.4" />
          <Stop offset="1" stopColor="white" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="48" fill={`url(#${id}-sphere)`}
        stroke="#EAF7E5" strokeOpacity="0.75" strokeWidth="1" />
      <Circle cx="50" cy="50" r="47" fill={`url(#${id}-highlight)`} />
    </Svg>
  );
}

export function OrbitRings() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width="100%" height="100%" viewBox="0 0 340 330">
      <Defs>
        <RadialGradient id={`${id}-glow`}>
          <Stop offset="0" stopColor="#D5EAC7" stopOpacity="0.36" />
          <Stop offset="1" stopColor="#D5EAC7" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${id}-satellite`} cx="30%" cy="25%">
          <Stop offset="0" stopColor="#F0F8EA" />
          <Stop offset="1" stopColor="#9ABDA0" />
        </RadialGradient>
      </Defs>
      <Circle cx="171" cy="175" r="163" fill={`url(#${id}-glow)`} />
      <G transform="rotate(-30 171 167)" fill="none" stroke="#D9EBD3">
        <Ellipse cx="171" cy="167" rx="168" ry="132" strokeOpacity="0.27" strokeWidth="0.8" />
        <Ellipse cx="171" cy="167" rx="137" ry="112" strokeOpacity="0.3" strokeWidth="0.8" />
        <Ellipse cx="171" cy="167" rx="108" ry="90" strokeOpacity="0.23" strokeWidth="0.7" />
        <Path d="M 5 155 A 168 132 0 0 1 298 83" strokeOpacity="0.42" strokeWidth="1" />
      </G>
      {[[240, 29, 10], [22, 158, 8], [281, 212, 6], [161, 300, 6], [322, 210, 3]].map(([x, y, r]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={r}
          fill={`url(#${id}-satellite)`} stroke="#E4F4DD" strokeOpacity="0.5" strokeWidth="0.6" />
      ))}
      {[[124, 23], [161, 29], [84, 282], [212, 312], [312, 117], [41, 110], [202, 20]].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#E4F4DD" opacity="0.6" />
      ))}
    </Svg>
  );
}

export type OrbitIconName = 'orbit' | 'person' | 'leaf' | 'plus' | 'close' | 'edit' | 'arrow' | 'menu' | 'back' | 'lock';
export function OrbitIcon({ name, color = '#173F30', size = 24 }: {
  name: OrbitIconName; color?: string; size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'orbit' && <>
        <Circle cx="12" cy="12" r="6.8" fill={color} opacity="0.9" />
        <Ellipse cx="12" cy="12" rx="11" ry="4.5" transform="rotate(-28 12 12)" stroke={color} strokeWidth="1.5" />
        <Circle cx="9.7" cy="9.7" r="3.3" fill="white" opacity="0.23" />
        <Circle cx="20.1" cy="6.5" r="1.4" fill={color} />
      </>}
      {name === 'person' && <>
        <Circle cx="12" cy="7" r="4" fill={color} />
        <Path d="M3 22v-2a9 9 0 0 1 18 0v2Z" fill={color} />
      </>}
      {name === 'leaf' && <Path d="M7 22 16 4M10 16C1 17 2 8 2 8s9-2 8 8ZM13 11c-1-7 7-8 7-8s3 8-7 8Z"
        stroke={color} strokeWidth="1.4" strokeLinecap="round" fill={color} fillOpacity="0.3" />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth="1.7" strokeLinecap="round" />}
      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
      {name === 'edit' && <Path d="m5 15-1 5 5-1L20 8l-4-4ZM13 7l4 4" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />}
      {name === 'arrow' && <Path d="M5 12h14m-5-5 5 5-5 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'menu' && <Path d="M4 6h16M4 12h16M4 18h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
      {name === 'back' && <Path d="M19 12H5m5-5-5 5 5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'lock' && <>
        <Path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={color} strokeWidth="1.7" />
        <Rect x="4" y="10" width="16" height="12" rx="3" stroke={color} strokeWidth="1.7" />
        <Path d="M12 15v3" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      </>}
    </Svg>
  );
}
