import { useState, useCallback, useEffect } from 'react';
import type { Client, AppView } from '../types';
import { hashPassword } from '../lib/crypto';

const SESSION_KEY = 'irontrack_session';

interface AuthState {
  authenticatedUser: Client | null;
  view: AppView;
  loginError: string;
  /** When superadmin is impersonating a coach, stores the original superadmin user */
  impersonating: Client | null;
}

/** Persisted shape — narrower than AuthState so we never write loginError. */
interface PersistedSession {
  user: Client;
  view: AppView;
  impersonating: Client | null;
}

interface UseAuthReturn extends AuthState {
  login: (clients: Client[], email: string, password: string) => Promise<void>;
  logout: () => void;
  setView: (view: AppView) => void;
  /** Superadmin can impersonate a coach to see their environment */
  impersonate: (coach: Client) => void;
  /** Stop impersonating and return to superadmin view */
  stopImpersonating: () => void;
}

function viewForRole(role: Client['role']): AppView {
  switch (role) {
    case 'superadmin': return 'superadmin';
    case 'admin':      return 'coach';
    case 'trainee':    return 'trainee';
  }
}

/** Synchronously read the persisted session — runs inside useState's initializer
 *  so the very first render already reflects the restored auth state. */
function readPersistedSession(): PersistedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed || !parsed.user || !parsed.view) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedSession(session: PersistedSession | null): void {
  if (typeof window === 'undefined') return;
  if (session === null) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

/**
 * Determine the initial view. Magic-link URLs (`/signup`, `?invite=`) override
 * any persisted session view so an invite click always lands on the signup form.
 */
function initialViewFromUrl(fallback: AppView): AppView {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname.startsWith('/signup') || params.has('invite')) {
    return 'signup';
  }
  return fallback;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>(() => {
    const session = readPersistedSession();
    if (!session) {
      return {
        authenticatedUser: null,
        view: initialViewFromUrl('landing'),
        loginError: '',
        impersonating: null,
      };
    }
    return {
      authenticatedUser: session.user,
      view: initialViewFromUrl(session.view),
      loginError: '',
      impersonating: session.impersonating ?? null,
    };
  });

  // Persist (or clear) whenever auth-affecting state changes. loginError is
  // explicitly excluded from the deps because it's a transient UI flag, not
  // session state.
  useEffect(() => {
    if (state.authenticatedUser) {
      writePersistedSession({
        user: state.authenticatedUser,
        view: state.view,
        impersonating: state.impersonating,
      });
    } else {
      writePersistedSession(null);
    }
  }, [state.authenticatedUser, state.view, state.impersonating]);

  const login = useCallback(async (clients: Client[], email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const hashedInput = await hashPassword(password.trim());

    const user = clients.find(
      (c) => c.email.toLowerCase() === normalizedEmail && c.password === hashedInput
    );

    if (!user) {
      setState((prev) => ({ ...prev, loginError: 'Invalid email or password.' }));
      return;
    }

    setState({ authenticatedUser: user, view: viewForRole(user.role), loginError: '', impersonating: null });
  }, []);

  const logout = useCallback(() => {
    setState({ authenticatedUser: null, view: 'landing', loginError: '', impersonating: null });
  }, []);

  const setView = useCallback((view: AppView) => {
    setState((prev) => ({ ...prev, view }));
  }, []);

  const impersonate = useCallback((coach: Client) => {
    setState((prev) => ({
      ...prev,
      impersonating: prev.authenticatedUser,
      authenticatedUser: coach,
      view: 'coach',
    }));
  }, []);

  const stopImpersonating = useCallback(() => {
    setState((prev) => ({
      ...prev,
      authenticatedUser: prev.impersonating,
      impersonating: null,
      view: 'superadmin',
    }));
  }, []);

  return { ...state, login, logout, setView, impersonate, stopImpersonating };
}
