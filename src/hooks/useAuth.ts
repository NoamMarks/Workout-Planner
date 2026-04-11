import { useState, useCallback } from 'react';
import type { Client, AppView } from '../types';
import { hashPassword } from '../lib/crypto';

interface AuthState {
  authenticatedUser: Client | null;
  view: AppView;
  loginError: string;
  /** When superadmin is impersonating a coach, stores the original superadmin user */
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

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    authenticatedUser: null,
    view: 'landing',
    loginError: '',
    impersonating: null,
  });

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