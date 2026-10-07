import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { organizeManually, organizePreview, validateOrganization, type Category, type ThoughtOrganizer } from '@/services/thought-organizer';
import { StorageGate } from '@/components/storage-gate';
import { openOrbitRepository } from '@/storage/database';
import { emptyOrbit, type OrbitRepository, type Profile } from '@/storage/repository';
import type { Thought, ThoughtDump } from './thought-store';
type OrbitState = {
  thoughts: Thought[]; categories: Category[]; dumps: ThoughtDump[]; dominantCategoryId: string | null; profile: Profile;
  storageKind: 'sqlite' | 'browser';
  addThought: (text: string, category?: string) => Promise<{ count: number; categories: string[]; unsorted: boolean }>;
  updateProfile: (profile: Profile) => Promise<void>;
  refreshOrbit: () => Promise<void>;
};
const OrbitContext = createContext<OrbitState | null>(null);

export function OrbitProvider({ children, organizer = organizePreview }: { children: ReactNode; organizer?: ThoughtOrganizer }) {
  const [snapshot, setSnapshot] = useState(emptyOrbit);
  const [storageKind, setStorageKind] = useState<'sqlite' | 'browser'>('sqlite');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const repository = useRef<OrbitRepository | null>(null);

  useEffect(() => {
    let mounted = true;
    openOrbitRepository().then(async (repo) => {
      const saved = await repo.load();
      if (mounted) {
        repository.current = repo;
        setSnapshot(saved);
        setStorageKind(repo.storageKind);
        setPhase('ready');
      }
    }).catch(() => { if (mounted) setPhase('error'); });
    return () => { mounted = false; };
  }, [attempt]);

  async function addThought(text: string, category?: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Write a thought first.');
    const repo = repository.current;
    if (!repo) throw new Error('Your saved Orbit is still loading. Please try again.');
    const organization = validateOrganization(trimmed, category?.trim()
      ? organizeManually(trimmed, category) : await organizer(trimmed, snapshot.categories));
    try {
      // Update the screen only after the whole database transaction has committed.
      setSnapshot(await repo.saveThoughtDump(trimmed, organization));
    } catch {
      throw new Error('Your thought could not be saved. Your draft is still here; please try again.');
    }
    const labels = [...new Set(organization.parts.map((part) => part.category))];
    return { count: organization.parts.length, categories: labels, unsorted: labels.includes('Unsorted') };
  }

  async function updateProfile(profile: Profile) {
    const repo = repository.current;
    if (!repo) throw new Error('Your saved Orbit is still loading. Please try again.');
    try { setSnapshot(await repo.saveProfile(profile)); }
    catch { throw new Error('Your profile could not be saved. Keep a name for your local login and try again.'); }
  }

  async function refreshOrbit() {
    if (!repository.current) throw new Error('Your saved Orbit is still loading.');
    setSnapshot(await repository.current.load());
  }

  if (phase !== 'ready') return <StorageGate failed={phase === 'error'} onRetry={() => {
    setPhase('loading');
    setAttempt((value) => value + 1);
  }} />;
  return (
    <OrbitContext value={{ ...snapshot, storageKind, addThought, updateProfile, refreshOrbit }}>
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
