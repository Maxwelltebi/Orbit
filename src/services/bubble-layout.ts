const orbitSlots = [
  { x: 171, y: 177, radius: 58 },
  { x: 77, y: 84, radius: 43 },
  { x: 273, y: 107, radius: 42 },
  { x: 56, y: 246, radius: 36 },
  { x: 254, y: 282, radius: 33 },
];

export function bubbleCanvasHeight(count: number) {
  return count <= 5 ? 330 : Math.ceil(count / 2) * 158;
}

export function bubblePosition(index: number, count: number, thoughts: number) {
  const slot = count <= 5 ? orbitSlots[index] : { x: 85 + (index % 2) * 170, y: 79 + Math.floor(index / 2) * 158, radius: 50 };
  return { ...slot, radius: slot.radius + Math.min(count <= 5 ? 5 : 14, Math.sqrt(thoughts) * 2.5) };
}
