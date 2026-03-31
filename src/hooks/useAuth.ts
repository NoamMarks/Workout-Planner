import { useState, useCallback } from 'react';
import type { Client, AppView } from '../types';
import { hashPassword } from '../lib/crypto';

interface AuthState {
  authenticatedUser: Client | null;
  view: AppView;
  loginError: string;
}

interface UseAuthReturn extends AuthState {
  login: (clients: Client[], email: string, password: string) => Promise<void>;
  logout: () => void;
  setView: (view: AppView) => void;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    authenticatedUser: null,
    view: 'landing',
    loginError: '',
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

    const nextView: AppView = user.role === 'coach' ? 'coach' : 'trainee';
    setState({ authenticatedUser: user, view: nextView, loginError: '' });
  }, []);

  const logout = useCallback(() => {
    setState({ authenticatedUser: null, view: 'landing', loginError: '' });
  }, []);

  const setView = useCallback((view: AppView) => {
    setState((prev) => ({ ...prev, view }));
  }, []);

  return { ...state, login, logout, setView };
}
