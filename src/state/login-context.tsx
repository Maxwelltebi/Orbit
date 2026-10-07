import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';
import { LoginScreen } from '@/components/login-screen';
import { StorageGate } from '@/components/storage-gate';
import { createLocalLogin, type LocalLogin } from '@/security/local-login';
import { loginDeadline } from '@/security/login-deadline';
import { randomHex, secretStore } from '@/security/secret-store';
import { openOrbitRepository } from '@/storage/database';
import { useOrbit } from './orbit-context';

const LoginContext = createContext<{ lock: () => void } | null>(null);
type Phase = 'loading' | 'error' | 'setup' | 'locked' | 'unlocked';
export function LoginProvider({ children }: { children: ReactNode }) {
  const { profile, storageKind, refreshOrbit } = useOrbit();
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [screenVersion, setScreenVersion] = useState(0);
  const login = useRef<LocalLogin | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);

  function lock() {
    generation.current++;
    Keyboard.dismiss();
    setScreenVersion((value) => value + 1);
    setPhase((current) => current === 'unlocked' ? 'locked' : current);
  }
  useEffect(() => {
    mounted.current = true;
    const session = generation;
    return () => { mounted.current = false; session.current++; };
  }, []);
  useEffect(() => {
    let active = true;
    openOrbitRepository().then(async (repository) => {
      const service = createLocalLogin(repository, secretStore, randomHex);
      const status = await service.status();
      if (active) { login.current = service; setPhase(status); }
    }).catch((error) => {
      if (active) { setFailure(error instanceof Error ? error.message : 'Could not open your saved login. Please try again.'); setPhase('error'); }
    });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') lock(); });
    const onVisibility = () => { if (document.hidden) lock(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  async function submit(name: string, pin: string, confirmation: string, report: (stage: string) => void) {
    if (!login.current) throw new Error('Your saved login is still loading.');
    const currentGeneration = generation.current;
    if (phase === 'setup') {
      await login.current.setup(name, pin, confirmation, report);
      try { await loginDeadline(refreshOrbit(), () => 'loading your saved profile', 30000); }
      catch { if (mounted.current) { setFailure('Your login was saved, but your profile could not load. Please try again.'); setPhase('error'); } return; }
    } else await login.current.unlock(name, pin, report);
    // A completed hash must not reopen the app after a background/lock event.
    if (mounted.current) setPhase(currentGeneration === generation.current && AppState.currentState === 'active' ? 'unlocked' : 'locked');
  }

  if (phase === 'loading' || phase === 'error') return <StorageGate failed={phase === 'error'}
    message={phase === 'error' ? failure : 'Opening your saved login.'}
    onRetry={() => { setPhase('loading'); setAttempt((value) => value + 1); }} />;
  if (phase !== 'unlocked') return <LoginScreen key={`${phase}:${screenVersion}`} setup={phase === 'setup'} initialName={profile.name}
    browser={storageKind === 'browser'} onSubmit={submit} onStopWaiting={lock} />;
  return <LoginContext value={{ lock }}>{children}</LoginContext>;
}
export function useLogin() {
  const context = useContext(LoginContext);
  if (!context) throw new Error('useLogin must be used inside the unlocked LoginProvider');
  return context;
}
