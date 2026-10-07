import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import { organizeManually, organizePreview, validateOrganization, type Category, type ThoughtOrganizer } from '@/services/thought-organizer';
import { appendThoughtDump, emptyThoughtStore, type Thought, type ThoughtDump } from './thought-store';
type Profile = { name: string; about: string };
type OrbitState = {
  thoughts: Thought[]; categories: Category[]; dumps: ThoughtDump[]; profile: Profile;
  addThought: (text: string, category?: string) => Promise<{ count: number; categories: string[]; unsorted: boolean }>;
  updateProfile: (profile: Profile) => void;
};
const OrbitContext = createContext<OrbitState | null>(null);

// This first UI milestone uses session state. SQLite will replace this storage layer.
export function OrbitProvider({ children, organizer = organizePreview }: { children: ReactNode; organizer?: ThoughtOrganizer }) {
  const [store, setStore] = useState(emptyThoughtStore);
  const [profile, setProfile] = useState<Profile>({ name: '', about: '' });
  const sequence = useRef(0);
  async function addThought(text: string, category?: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Write a thought first.');
    const organization = validateOrganization(trimmed, category?.trim()
      ? organizeManually(trimmed, category) : await organizer(trimmed, store.categories));
    sequence.current += 1;
    const dump = { id: `${Date.now()}-${sequence.current}`, text: trimmed, createdAt: Date.now(), method: organization.method };
    // Commit every segment/category together; failed sorting never partially saves a dump.
    setStore((current) => appendThoughtDump(current, dump, organization));
    const labels = [...new Set(organization.parts.map((part) => part.category))];
    return { count: organization.parts.length, categories: labels, unsorted: labels.includes('Unsorted') };
  }
  return (
    <OrbitContext value={{ ...store, profile, addThought, updateProfile: setProfile }}>
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
