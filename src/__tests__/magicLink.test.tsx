/**
 * Phase 1: Magic Invite Link end-to-end behaviour.
 *
 * Covers:
 *  1. Storage layer: createInviteCode persists metadata; consumeInviteCode increments
 *     useCount; lookupInviteCode returns null once maxUses is reached.
 *  2. SignupPage: when `?invite=CODE` is in the URL, the field auto-fills,
 *     becomes read-only, and a welcome banner with the coach name renders.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignupPage } from '../components/auth/SignupPage';
import {
  createInviteCode,
  consumeInviteCode,
  lookupInviteCode,
  buildInviteLink,
} from '../lib/inviteCodes';

beforeEach(() => {
  localStorage.clear();
  // Reset jsdom URL between tests so URLSearchParams is clean.
  window.history.replaceState(null, '', '/');
});

// ─── Storage layer ──────────────────────────────────────────────────────────

describe('inviteCodes storage', () => {
  it('persists coachName and useCount=0 on creation', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    expect(inv.coachName).toBe('Coach Alpha');
    expect(inv.useCount).toBe(0);
    expect(inv.maxUses).toBeUndefined();
  });

  it('respects maxUses and rejects exhausted codes', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha', 1);
    expect(lookupInviteCode(inv.code)).not.toBeNull();
    consumeInviteCode(inv.code);
    expect(lookupInviteCode(inv.code)).toBeNull();
  });

  it('increments useCount on consumption', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    consumeInviteCode(inv.code);
    consumeInviteCode(inv.code);
    const refreshed = lookupInviteCode(inv.code);
    expect(refreshed?.useCount).toBe(2);
  });

  it('buildInviteLink produces a /signup?invite= URL', () => {
    const link = buildInviteLink('ABC123');
    expect(link).toContain('/signup?invite=ABC123');
  });

  it('lookup is case-insensitive', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    expect(lookupInviteCode(inv.code.toLowerCase())).not.toBeNull();
  });
});

// ─── SignupPage magic-link behaviour ────────────────────────────────────────

describe('SignupPage with ?invite= URL', () => {
  it('auto-fills the invite field and locks it when the URL carries a valid code', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    window.history.replaceState(null, '', `/signup?invite=${inv.code}`);

    render(
      <SignupPage
        onComplete={vi.fn().mockResolvedValue(undefined)}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    const inviteField = screen.getByTestId('signup-invite-code') as HTMLInputElement;
    expect(inviteField.value).toBe(inv.code);
    expect(inviteField.readOnly).toBe(true);
  });

  it('shows the welcome banner with the coach name when the link is valid', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    window.history.replaceState(null, '', `/signup?invite=${inv.code}`);

    render(
      <SignupPage
        onComplete={vi.fn().mockResolvedValue(undefined)}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    const banner = screen.getByTestId('invite-welcome-banner');
    expect(banner).toHaveTextContent(/Coach Alpha/);
  });

  it('shows the invalid banner and locks the field when the URL code is unknown', () => {
    window.history.replaceState(null, '', '/signup?invite=DOESNOTEXIST');

    render(
      <SignupPage
        onComplete={vi.fn().mockResolvedValue(undefined)}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    expect(screen.getByTestId('invite-invalid-banner')).toBeInTheDocument();
    const inviteField = screen.getByTestId('signup-invite-code') as HTMLInputElement;
    expect(inviteField.readOnly).toBe(true);
  });

  it('renders the form normally with no banner when there is no ?invite=', () => {
    render(
      <SignupPage
        onComplete={vi.fn().mockResolvedValue(undefined)}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    expect(screen.queryByTestId('invite-welcome-banner')).toBeNull();
    expect(screen.queryByTestId('invite-invalid-banner')).toBeNull();
    const inviteField = screen.getByTestId('signup-invite-code') as HTMLInputElement;
    expect(inviteField.readOnly).toBe(false);
  });

  it('consumes the invite after a successful signup (useCount increments by 1)', async () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    window.history.replaceState(null, '', `/signup?invite=${inv.code}`);

    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <SignupPage
        onComplete={onComplete}
        onBack={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('signup-name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByTestId('signup-confirm'), { target: { value: 'Password1' } });
    fireEvent.click(screen.getByTestId('signup-submit-btn'));

    // We're on the OTP step now — fish the code out of console.log
    let capturedOtp = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const m = String(args[0] ?? '').match(/(\d{6})/);
      if (m) capturedOtp = m[1];
    });

    // Step back to form to trigger another OTP send via Resend Code? The OTP was
    // already generated on submit — re-render isn't needed. Read it from the
    // generatedOtp via the resend button which logs again:
    fireEvent.click(screen.getByText(/Resend Code/i));
    spy.mockRestore();

    fireEvent.change(screen.getByTestId('signup-otp'), { target: { value: capturedOtp } });
    fireEvent.click(screen.getByTestId('signup-verify-btn'));

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('Test User', 'test@test.com', 'Password1', 'tenant-A');
    });

    // The invite useCount should now be 1
    const refreshed = lookupInviteCode(inv.code);
    expect(refreshed?.useCount).toBe(1);
  });
});
