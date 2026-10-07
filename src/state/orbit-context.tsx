import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

export const categories = [
  { id: 'family', label: 'Family', x: 77, y: 84, radius: 45 },
  { id: 'school', label: 'School', x: 273, y: 107, radius: 44 },
  { id: 'future', label: 'The future', x: 171, y: 177, radius: 64 },
  { id: 'money', label: 'Money', x: 56, y: 246, radius: 37 },
  { id: 'what-if', label: 'What if?', x: 254, y: 282, radius: 34 },
] as const;

export type CategoryId = (typeof categories)[number]['id'];
export type Thought = { id: string; text: string; categoryId: CategoryId; createdAt: number };
type Profile = { name: string; about: string };
type OrbitState = {
  thoughts: Thought[]; profile: Profile;
  addThought: (text: string, categoryId: CategoryId) => void;
  updateProfile: (profile: Profile) => void;
};
const OrbitContext = createContext<OrbitState | null>(null);

// This first UI milestone uses session state. SQLite will replace this storage layer.
export function OrbitProvider({ children }: { children: ReactNode }) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: '', about: '' });
  const sequence = useRef(0);
  function addThought(text: string, categoryId: CategoryId) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sequence.current += 1;
    const thought = { id: `${Date.now()}-${sequence.current}`, text: trimmed, categoryId, createdAt: Date.now() };
    setThoughts((current) => [thought, ...current]);
  }
  return (
    <OrbitContext value={{ thoughts, profile, addThought, updateProfile: setProfile }}>
      {children}
    </OrbitContext>
  );
}
export function useOrbit() {
  const state = useContext(OrbitContext);
  if (!state) throw new Error('useOrbit must be used inside OrbitProvider');
  return state;
}
export function profileInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]).join('').toUpperCase();
}
