/**
 * Silent-auth-failure regressions:
 *
 *  Bug 1 — full trainee signup persists the new user AND auto-logs them in.
 *  Bug 2 — password reset actually rewrites the stored hash; old hash differs
 *          from new and login can verify the new one.
 *  Bug 3 — invite-code generation refuses corrupt inputs at creation time, and
 *          lookup refuses corrupt records persisted from older versions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  createInviteCode,
  lookupInviteCode,
} from '../lib/inviteCodes';
import { useProgramData } from '../hooks/useProgramData';
import { useAuth } from '../hooks/useAuth';
import { hashPassword, isHashed } from '../lib/crypto';
import { ForgotPasswordPage } from '../components/auth/ForgotPasswordPage';
import { _clearTokenStore } from '../lib/verification';
import type { Client, InviteCode } from '../types';

beforeEach(() => {
  localStorage.clear();
  _clearTokenStore();
  window.history.replaceState(null, '', '/');
});

// ─── Bug 3: invite-code generation/lookup defenses ──────────────────────────

describe('createInviteCode rejects empty/missing tenantId or coachId', () => {
  it('throws when coachId is empty', () => {
    expect(() => createInviteCode('', 'tenant-A', 'Coach')).toThrow(/coachId/);
  });

  it('throws when tenantId is empty', () => {
    expect(() => createInviteCode('coach1', '', 'Coach')).toThrow(/tenantId/);
  });

  it('throws when tenantId is whitespace-only', () => {
    expect(() => createInviteCode('coach1', '   ', 'Coach')).toThrow(/tenantId/);
  });

  it('trims coachId and tenantId on successful creation', () => {
    const inv = createInviteCode('  coach1  ', '  tenant-A  ', 'Coach');
    expect(inv.coachId).toBe('coach1');
    expect(inv.tenantId).toBe('tenant-A');
  });
});

describe('lookupInviteCode refuses corrupt records', () => {
  it('returns null when a stored invite has no tenantId', () => {
    const corrupt: InviteCode = {
      id: 'corrupt1',
      code: 'BADCODE1',
      coachId: 'coach1',
      tenantId: '', // corrupt
      createdAt: new Date().toISOString(),
      useCount: 0,
    };
    localStorage.setItem('irontrack_invite_codes', JSON.stringify([corrupt]));
    expect(lookupInviteCode('BADCODE1')).toBeNull();
  });
});

// ─── Bug 1: full trainee signup persists user and auto-logs them in ────────

const TRAINEE_PASSWORD = 'Password1';
const TRAINEE_EMAIL = 'newtrainee@test.com';

async function bootstrapHook() {
  // Clean slate, then mount useProgramData and let bootstrap resolve.
  const programDataRef: { current: ReturnType<typeof useProgramData> | null } = { current: null };
  const authRef: { current: ReturnType<typeof useAuth> | null } = { current: null };

  const Harness = () => {
    programDataRef.current = useProgramData();
    authRef.current = useAuth();
    return null;
  };
  const { rerender } = render(<Harness />);
  // Wait for isBootstrapping to flip false (clients hashed/migrated)
  await waitFor(() => {
    expect(programDataRef.current?.isBootstrapping).toBe(false);
  });
  return { programDataRef, authRef, rerender };
}

describe('Trainee signup persistence', () => {
  it('addClient writes a hashed-password record to localStorage and is findable', async () => {
    const { programDataRef } = await bootstrapHook();

    let created: Client | null = null;
    await act(async () => {
      created = await programDataRef.current!.addClient(
        'New Trainee',
        TRAINEE_EMAIL,
        TRAINEE_PASSWORD,
        'trainee',
        'tenant-A',
      );
    });

    expect(created).not.toBeNull();
    expect(created!.tenantId).toBe('tenant-A');
    expect(created!.role).toBe('trainee');
    // Password is stored as a hash, never plaintext
    expect(created!.password).toBeTruthy();
    expect(created!.password).not.toBe(TRAINEE_PASSWORD);
    expect(isHashed(created!.password!)).toBe(true);

    // The clients array (and thus localStorage) contains the new user
    const stored = JSON.parse(localStorage.getItem('irontrack_clients') ?? '[]') as Client[];
    expect(stored.find((c) => c.email === TRAINEE_EMAIL)).toBeDefined();
  });

  it('addClient throws (does not silently no-op) when trainee tenantId is missing', async () => {
    const { programDataRef } = await bootstrapHook();
    await expect(
      programDataRef.current!.addClient('Orphan', 'orphan@test.com', 'Password1', 'trainee', undefined),
    ).rejects.toThrow(/tenantId/);
  });

  it('addClient stores trimmed email + password hash so login can match the original input', async () => {
    const { programDataRef, authRef } = await bootstrapHook();

    let created: Client | null = null;
    await act(async () => {
      created = await programDataRef.current!.addClient(
        '  Padded Trainee  ',
        `  ${TRAINEE_EMAIL}  `,
        `  ${TRAINEE_PASSWORD}  `,
        'trainee',
        'tenant-A',
      );
    });

    expect(created!.email).toBe(TRAINEE_EMAIL);
    expect(created!.name).toBe('Padded Trainee');

    // Now login with the *un-padded* values (matching what a user types) and
    // verify auth succeeds end-to-end. login() trims internally, addClient
    // trims internally, so both sides hash the same string.
    await act(async () => {
      const allClients = programDataRef.current!.clients;
      await authRef.current!.login(allClients, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    });
    expect(authRef.current!.authenticatedUser?.email).toBe(TRAINEE_EMAIL);
    expect(authRef.current!.view).toBe('trainee');
  });

  it('loginAsUser sets the authenticated user and routes to their view (auto-login bypass)', async () => {
    const { authRef } = await bootstrapHook();
    const fakeTrainee: Client = {
      id: 'newone',
      name: 'New Trainee',
      email: TRAINEE_EMAIL,
      password: 'irrelevant-already-hashed',
      role: 'trainee',
      tenantId: 'tenant-A',
      programs: [],
    };
    act(() => authRef.current!.loginAsUser(fakeTrainee));
    expect(authRef.current!.authenticatedUser?.id).toBe('newone');
    expect(authRef.current!.view).toBe('trainee');
  });
});

// ─── Bug 2: password reset rewrites the hash ───────────────────────────────

describe('Password reset rewrites the stored hash', () => {
  it('resetPassword changes the stored hash and old/new differ', async () => {
    const { programDataRef } = await bootstrapHook();

    // Create a user with a known starting password
    let created: Client | null = null;
    await act(async () => {
      created = await programDataRef.current!.addClient(
        'Reset Subject', 'reset@test.com', 'OldPass1', 'trainee', 'tenant-A',
      );
    });
    const oldHash = created!.password;

    // Reset their password
    await act(async () => {
      await programDataRef.current!.resetPassword(created!.id, 'NewPass1');
    });

    // Read latest from localStorage to confirm persistence
    const stored = JSON.parse(localStorage.getItem('irontrack_clients') ?? '[]') as Client[];
    const refreshed = stored.find((c) => c.id === created!.id);
    expect(refreshed).toBeDefined();
    expect(refreshed!.password).not.toBe(oldHash);
    expect(refreshed!.password).toBe(await hashPassword('NewPass1'));
  });

  it('resetPassword throws when clientId is unknown — no silent no-op', async () => {
    const { programDataRef } = await bootstrapHook();
    await expect(
      programDataRef.current!.resetPassword('does-not-exist', 'NewPass1'),
    ).rejects.toThrow(/no client/i);
  });

  it('ForgotPasswordPage surfaces an inline error when resetPassword throws', async () => {
    const user: Client = {
      id: 'reset-target',
      name: 'Reset Subject',
      email: 'reset@test.com',
      password: await hashPassword('OldPass1'),
      role: 'trainee',
      tenantId: 'tenant-A',
      programs: [],
    };
    const onResetPassword = vi.fn().mockRejectedValue(new Error('disk on fire'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ForgotPasswordPage
        clients={[user]}
        onResetPassword={onResetPassword}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    // Step 1 — submit email
    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'reset@test.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));
    // Capture the OTP from console
    let capturedCode = '';
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const m = String(args[0] ?? '').match(/(\d{6})/);
      if (m) capturedCode = m[1];
    });
    // Step 1 produced a token; we already captured it via the spy below. Re-render:
    logSpy.mockRestore();

    // Re-fetch the OTP by reading from the existing log spy is awkward — instead,
    // read the token directly from the in-memory store.
    const { _getTokenStore } = await import('../lib/verification');
    capturedCode = _getTokenStore().find((t) => t.email === 'reset@test.com')?.code ?? '';
    expect(capturedCode).toMatch(/^\d{6}$/);

    // Step 2 — enter code
    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: capturedCode } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    // Step 3 — set new password (which will throw)
    fireEvent.change(screen.getByTestId('forgot-new-password'), { target: { value: 'NewPass1' } });
    fireEvent.change(screen.getByTestId('forgot-confirm-password'), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByTestId('forgot-password-submit'));

    // Error shown inline, never silently dropped
    await waitFor(() => {
      expect(screen.getByTestId('forgot-password-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/disk on fire/)).toBeInTheDocument();

    errSpy.mockRestore();
  });
});
