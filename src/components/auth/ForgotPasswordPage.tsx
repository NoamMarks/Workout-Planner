import { useState } from 'react';
import { Dumbbell, Sun, Moon, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { TechnicalCard, TechnicalInput } from '../ui';
import { checkPasswordStrength } from '../../lib/crypto';
import { isValidEmail, INVALID_EMAIL_MESSAGE } from '../../lib/validation';
import {
  createResetToken,
  validateResetToken,
  consumeResetToken,
  sendPasswordResetEmail,
} from '../../lib/verification';
import type { Client } from '../../types';

interface ForgotPasswordPageProps {
  clients: Client[];
  onResetPassword: (clientId: string, newPassword: string) => Promise<void>;
  onBack: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

type Step = 'email' | 'code' | 'newPassword' | 'done';

export function ForgotPasswordPage({
  clients,
  onResetPassword,
  onBack,
  theme,
  onToggleTheme,
}: ForgotPasswordPageProps) {
  const [step, setStep] = useState<Step>('email');

  // Email step
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  // Code step
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  // New password step
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Internal
  const [resolvedUser, setResolvedUser] = useState<Client | null>(null);

  const handleEmailSubmit = () => {
    if (!isValidEmail(email)) {
      setEmailError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setEmailError('');

    const normalizedEmail = email.trim().toLowerCase();
    const user = clients.find((c) => c.email.toLowerCase() === normalizedEmail);

    if (user) {
      // Real user — generate a token and "send" it
      const token = createResetToken(normalizedEmail);
      setResolvedUser(user);
      sendPasswordResetEmail(normalizedEmail, token.code);
    }

    // Always advance to code step to prevent email harvesting
    setStep('code');
  };

  const handleCodeSubmit = () => {
    const normalizedEmail = email.trim().toLowerCase();

    // If there was no real user, any code fails silently
    if (!resolvedUser || !validateResetToken(normalizedEmail, code.trim())) {
      setCodeError('Invalid or expired code. Please try again.');
      return;
    }

    setCodeError('');
    setStep('newPassword');
  };

  const handlePasswordSubmit = async () => {
    const errs: string[] = [];
    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) errs.push(...strength.errors.map((e) => `${e}`));
    if (newPassword !== confirmPassword) errs.push('Passwords do not match.');
    if (errs.length > 0) { setPasswordErrors(errs); return; }

    setSubmitting(true);
    setPasswordErrors([]);

    // Consume the token so it can't be reused
    consumeResetToken(email.trim().toLowerCase(), code.trim());

    // Actually reset the password
    await onResetPassword(resolvedUser!.id, newPassword);
    setStep('done');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex justify-between items-center p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-foreground flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-background" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest font-mono">IronTrack</span>
        </div>
        <button onClick={onToggleTheme} className="p-2 hover:bg-muted rounded-sm transition-colors">
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </nav>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <button
              onClick={onBack}
              data-testid="forgot-back-btn"
              className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Login
            </button>

            <h1 className="text-5xl font-bold tracking-tighter uppercase italic font-serif leading-none">
              Reset Password
            </h1>
            <p className="text-muted-foreground font-mono text-xs mt-3 uppercase tracking-widest">
              {step === 'email' && 'Enter your email to receive a reset code'}
              {step === 'code' && 'Enter the 6-digit code sent to your email'}
              {step === 'newPassword' && 'Choose a new password'}
              {step === 'done' && 'Password updated successfully'}
            </p>
          </motion.div>

          {/* Step 1: Email entry */}
          {step === 'email' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <TechnicalCard>
                <div className="p-8 space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                      Email Address
                    </label>
                    <div className="field-wrap">
                      <TechnicalInput
                        value={email}
                        onChange={setEmail}
                        placeholder="you@example.com"
                        type="email"
                        data-testid="forgot-email"
                      />
                    </div>
                  </div>
                  {emailError && (
                    <p className="text-[10px] font-mono text-red-500" data-testid="forgot-email-error">
                      {emailError}
                    </p>
                  )}
                  <button
                    onClick={handleEmailSubmit}
                    disabled={!email.trim()}
                    data-testid="forgot-email-submit"
                    className="btn-press w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest rounded-input hover:opacity-90 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send Reset Code
                  </button>
                </div>
              </TechnicalCard>
            </motion.div>
          )}

          {/* Step 2: OTP code entry */}
          {step === 'code' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <TechnicalCard>
                <div className="p-8 space-y-6">
                  <p className="text-xs font-mono text-muted-foreground">
                    If an account exists for <span className="text-foreground font-bold">{email}</span>,
                    a reset code has been sent. Check the browser console.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                      Reset Code
                    </label>
                    <div className="field-wrap">
                      <TechnicalInput
                        value={code}
                        onChange={setCode}
                        placeholder="000000"
                        data-testid="forgot-code"
                        className="text-center text-2xl tracking-[0.5em] font-mono"
                      />
                    </div>
                  </div>

                  {codeError && (
                    <p className="text-[10px] font-mono text-red-500" data-testid="forgot-code-error">
                      {codeError}
                    </p>
                  )}

                  <button
                    onClick={handleCodeSubmit}
                    disabled={code.trim().length !== 6}
                    data-testid="forgot-code-submit"
                    className="btn-press w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest rounded-input hover:opacity-90 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Verify Code
                  </button>
                </div>
              </TechnicalCard>
            </motion.div>
          )}

          {/* Step 3: New password */}
          {step === 'newPassword' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <TechnicalCard>
                <div className="p-8 space-y-5">
                  {[
                    { label: 'New Password', value: newPassword, set: setNewPassword, testId: 'forgot-new-password', placeholder: 'Min 8 chars, 1 letter, 1 number' },
                    { label: 'Confirm Password', value: confirmPassword, set: setConfirmPassword, testId: 'forgot-confirm-password', placeholder: '••••••••' },
                  ].map(({ label, value, set, testId, placeholder }) => (
                    <div key={label} className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                        {label}
                      </label>
                      <div className="field-wrap">
                        <TechnicalInput
                          value={value}
                          onChange={set}
                          placeholder={placeholder}
                          type="password"
                          data-testid={testId}
                        />
                      </div>
                    </div>
                  ))}

                  {newPassword.length > 0 && (
                    <div className="space-y-1">
                      {checkPasswordStrength(newPassword).errors.map((e) => (
                        <p key={e} className="text-[10px] font-mono text-amber-500">{e}</p>
                      ))}
                      {checkPasswordStrength(newPassword).ok && (
                        <p className="text-[10px] font-mono text-green-500">Password meets requirements</p>
                      )}
                    </div>
                  )}

                  {passwordErrors.length > 0 && (
                    <div className="space-y-1">
                      {passwordErrors.map((e) => (
                        <p key={e} className="text-[10px] font-mono text-red-500" data-testid="forgot-password-error">{e}</p>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handlePasswordSubmit}
                    disabled={submitting}
                    data-testid="forgot-password-submit"
                    className="btn-press w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest rounded-input hover:opacity-90 shadow-lg disabled:opacity-40"
                  >
                    {submitting ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </TechnicalCard>
            </motion.div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <TechnicalCard>
                <div className="p-8 space-y-6 text-center">
                  <p className="text-xs font-mono text-green-500 uppercase tracking-widest">
                    Password updated successfully
                  </p>
                  <button
                    onClick={onBack}
                    data-testid="forgot-back-to-login"
                    className="btn-press w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest rounded-input hover:opacity-90 shadow-lg"
                  >
                    Back to Login
                  </button>
                </div>
              </TechnicalCard>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}