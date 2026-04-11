import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForgotPasswordPage } from '../components/auth/ForgotPasswordPage';
import { _clearTokenStore } from '../lib/verification';
import type { Client } from '../types';

// We need the real verification module (not mocked) so the full flow works end-to-end.
// Spy on console.log to capture the reset code.

const EXISTING_USER: Client = {
  id: 'u1',
  name: 'Test User',
  email: 'test@example.com',
  password: 'oldhash',
  role: 'trainee',
  tenantId: 'coach1',
  programs: [],
};

describe('Forgot Password Integration', () => {
  let capturedCode: string;
  const onResetPassword = vi.fn().mockResolvedValue(undefined);
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    _clearTokenStore();
    capturedCode = '';

    // Intercept console.log to capture the reset code
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const msg = String(args[0] ?? '');
      if (msg.includes('[PASSWORD RESET CODE]')) {
        const match = msg.match(/:\s*(\d{6})/);
        if (match) capturedCode = match[1];
      }
    });
  });

  function renderPage() {
    return render(
      <ForgotPasswordPage
        clients={[EXISTING_USER]}
        onResetPassword={onResetPassword}
        onBack={onBack}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );
  }

  it('completes a full reset cycle: email → code → new password', async () => {
    renderPage();

    // Step 1: Enter email
    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));

    // Step 2: Should now show code input; the code was logged to console
    expect(screen.getByTestId('forgot-code')).toBeInTheDocument();
    expect(capturedCode).toMatch(/^\d{6}$/);

    // Enter the correct code
    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: capturedCode } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    // Step 3: Should now show new password form
    expect(screen.getByTestId('forgot-new-password')).toBeInTheDocument();

    // Enter a strong new password
    fireEvent.change(screen.getByTestId('forgot-new-password'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByTestId('forgot-confirm-password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByTestId('forgot-password-submit'));

    // Verify onResetPassword was called and success state is shown
    await vi.waitFor(() => {
      expect(onResetPassword).toHaveBeenCalledWith('u1', 'NewPass123');
      expect(screen.getByTestId('forgot-back-to-login')).toBeInTheDocument();
    });
  });

  it('shows the code step even for a non-existent email (anti-harvesting)', () => {
    renderPage();

    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));

    // Should still show the code input — no "email not found" error
    expect(screen.getByTestId('forgot-code')).toBeInTheDocument();
    // But no code was logged since the email doesn't exist
    expect(capturedCode).toBe('');
  });

  it('rejects an incorrect reset code', () => {
    renderPage();

    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));

    // Enter wrong code
    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: '999999' } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    expect(screen.getByTestId('forgot-code-error')).toBeInTheDocument();
    expect(onResetPassword).not.toHaveBeenCalled();
  });

  it('rejects a weak new password', () => {
    renderPage();

    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));

    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: capturedCode } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    // Enter a weak password (no number)
    fireEvent.change(screen.getByTestId('forgot-new-password'), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByTestId('forgot-confirm-password'), { target: { value: 'weakpass' } });
    fireEvent.click(screen.getByTestId('forgot-password-submit'));

    expect(screen.getByTestId('forgot-password-error')).toBeInTheDocument();
    expect(onResetPassword).not.toHaveBeenCalled();
  });

  it('prevents reuse of a consumed token', async () => {
    renderPage();

    // Complete the first reset
    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));
    const firstCode = capturedCode;

    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: firstCode } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    fireEvent.change(screen.getByTestId('forgot-new-password'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByTestId('forgot-confirm-password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByTestId('forgot-password-submit'));

    await vi.waitFor(() => {
      expect(onResetPassword).toHaveBeenCalledTimes(1);
    });

    // Now try to re-render and use the same code again
    renderPage();
    fireEvent.change(screen.getByTestId('forgot-email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-email-submit'));

    // Try entering the OLD consumed code (not the new one)
    fireEvent.change(screen.getByTestId('forgot-code'), { target: { value: firstCode } });
    fireEvent.click(screen.getByTestId('forgot-code-submit'));

    // Should fail — token was consumed
    expect(screen.getByTestId('forgot-code-error')).toBeInTheDocument();
  });
});