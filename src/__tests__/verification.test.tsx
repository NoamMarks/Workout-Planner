import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignupPage } from '../components/auth/SignupPage';

// Mock invite code lookup — return a valid invite for 'VALID123'
vi.mock('../lib/inviteCodes', () => ({
  lookupInviteCode: (code: string) =>
    code.trim().toUpperCase() === 'VALID123'
      ? {
          id: 'inv1',
          code: 'VALID123',
          tenantId: 'tenant-A',
          coachId: 'coachA',
          coachName: 'Coach Alpha',
          createdAt: '',
          useCount: 0,
        }
      : null,
  createInviteCode: vi.fn(),
  getInviteCodesForCoach: vi.fn(() => []),
  deleteInviteCode: vi.fn(),
  consumeInviteCode: vi.fn(),
  buildInviteLink: (code: string) => `http://localhost/signup?invite=${code}`,
}));

// Capture the OTP that gets "sent"
let capturedOtp = '';
vi.mock('../lib/verification', () => ({
  generateOTP: () => {
    capturedOtp = '123456';
    return '123456';
  },
  sendVerificationEmail: vi.fn(),
}));

describe('Verified Signup Flow', () => {
  const onComplete = vi.fn().mockResolvedValue(undefined);
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOtp = '';
  });

  function fillForm(inviteCode = 'VALID123') {
    render(
      <SignupPage
        onComplete={onComplete}
        onBack={onBack}
        theme="dark"
        onToggleTheme={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('signup-name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByTestId('signup-confirm'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByTestId('signup-invite-code'), { target: { value: inviteCode } });
  }

  it('blocks signup with an invalid invite code', () => {
    fillForm('BADCODE');
    fireEvent.click(screen.getByTestId('signup-submit-btn'));

    // Should still be on form step with error
    expect(screen.getByText(/invalid invite code/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('advances to OTP step with a valid invite code', () => {
    fillForm('VALID123');
    fireEvent.click(screen.getByTestId('signup-submit-btn'));

    // Should now see the verification code input
    expect(screen.getByTestId('signup-otp')).toBeInTheDocument();
    expect(screen.getByTestId('signup-verify-btn')).toBeInTheDocument();
  });

  it('rejects an incorrect verification code', () => {
    fillForm('VALID123');
    fireEvent.click(screen.getByTestId('signup-submit-btn'));

    // Enter wrong OTP
    fireEvent.change(screen.getByTestId('signup-otp'), { target: { value: '999999' } });
    fireEvent.click(screen.getByTestId('signup-verify-btn'));

    expect(screen.getByTestId('otp-error')).toBeInTheDocument();
    expect(screen.getByText(/incorrect verification code/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('creates the account only after the correct OTP is entered', async () => {
    fillForm('VALID123');
    fireEvent.click(screen.getByTestId('signup-submit-btn'));

    // Enter correct OTP
    fireEvent.change(screen.getByTestId('signup-otp'), { target: { value: capturedOtp } });
    fireEvent.click(screen.getByTestId('signup-verify-btn'));

    // onComplete should have been called with correct args
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('Test User', 'test@test.com', 'Password1', 'tenant-A');
    });
  });
});