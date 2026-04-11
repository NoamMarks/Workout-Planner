import { useState } from 'react';
import { Dumbbell, Sun, Moon, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { TechnicalCard, TechnicalInput } from '../ui';
import { checkPasswordStrength } from '../../lib/crypto';
import { lookupInviteCode } from '../../lib/inviteCodes';
import { generateOTP, sendVerificationEmail } from '../../lib/verification';

interface SignupPageProps {
  onComplete: (name: string, email: string, password: string, tenantId: string) => Promise<void>;
  onBack: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

type Step = 'form' | 'verify';

export function SignupPage({ onComplete, onBack, theme, onToggleTheme }: SignupPageProps) {
  const [step, setStep] = useState<Step>('form');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  // OTP state
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resolvedTenantId, setResolvedTenantId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = checkPasswordStrength(password);

  const handleSubmitForm = () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required.');
    if (!email.trim()) errs.push('Email is required.');
    if (!strength.ok) errs.push(...strength.errors.map((e) => `Password: ${e}`));
    if (password !== confirm) errs.push('Passwords do not match.');

    // Validate invite code
    const invite = lookupInviteCode(inviteCode);
    if (!invite) {
      errs.push('Invalid invite code. Please check with your coach.');
    }

    if (errs.length > 0) { setErrors(errs); return; }

    // Generate OTP and "send" email
    const code = generateOTP();
    setGeneratedOtp(code);
    setResolvedTenantId(invite!.tenantId);
    sendVerificationEmail(email.trim(), code);
    setStep('verify');
    setErrors([]);
  };

  const handleVerify = async () => {
    if (otp.trim() !== generatedOtp) {
      setOtpError('Incorrect verification code. Please try again.');
      return;
    }
    setOtpError('');
    setSubmitting(true);
    await onComplete(name.trim(), email.trim(), password, resolvedTenantId);
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
              className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Login
            </button>

            <h1 className="text-5xl font-bold tracking-tighter uppercase italic font-serif leading-none">
              Sign Up
            </h1>
            <p className="text-muted-foreground font-mono text-xs mt-3 uppercase tracking-widest">
              {step === 'form' ? 'Create your training account' : 'Verify your email'}
            </p>
          </motion.div>

          {step === 'form' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <TechnicalCard>
                <div className="p-8 space-y-5">
                  {[
                    { label: 'Full Name', value: name, set: setName, placeholder: 'John Doe', testId: 'signup-name', type: 'text' },
                    { label: 'Email', value: email, set: setEmail, placeholder: 'john@example.com', testId: 'signup-email', type: 'email' },
                    { label: 'Password', value: password, set: setPassword, placeholder: 'Min 8 chars, 1 letter, 1 number', testId: 'signup-password', type: 'password' },
                    { label: 'Confirm Password', value: confirm, set: setConfirm, placeholder: '••••••••', testId: 'signup-confirm', type: 'password' },
                    { label: 'Coach Invite Code', value: inviteCode, set: setInviteCode, placeholder: 'e.g. A1B2C3D4', testId: 'signup-invite-code', type: 'text' },
                  ].map(({ label, value, set, placeholder, testId, type }) => (
                    <div key={label} className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                        {label}
                      </label>
                      <div className="bg-muted/30 p-4 border border-border">
                        <TechnicalInput
                          value={value}
                          onChange={set}
                          placeholder={placeholder}
                          type={type}
                          data-testid={testId}
                        />
                      </div>
                    </div>
                  ))}

                  {password.length > 0 && (
                    <div className="space-y-1">
                      {strength.errors.map((e) => (
                        <p key={e} className="text-[10px] font-mono text-amber-500">{e}</p>
                      ))}
                      {strength.ok && (
                        <p className="text-[10px] font-mono text-green-500">Password meets requirements</p>
                      )}
                    </div>
                  )}

                  {errors.length > 0 && (
                    <div className="space-y-1">
                      {errors.map((e) => (
                        <p key={e} className="text-[10px] font-mono text-red-500">{e}</p>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitForm}
                    data-testid="signup-submit-btn"
                    className="w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg"
                  >
                    Continue
                  </button>
                </div>
              </TechnicalCard>
            </motion.div>
          )}

          {step === 'verify' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <TechnicalCard>
                <div className="p-8 space-y-6">
                  <p className="text-xs font-mono text-muted-foreground">
                    A 6-digit verification code has been sent to <span className="text-foreground font-bold">{email}</span>.
                    Check the browser console for the code.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                      Verification Code
                    </label>
                    <div className="bg-muted/30 p-4 border border-border">
                      <TechnicalInput
                        value={otp}
                        onChange={setOtp}
                        placeholder="000000"
                        data-testid="signup-otp"
                        className="text-center text-2xl tracking-[0.5em]"
                      />
                    </div>
                  </div>

                  {otpError && (
                    <p className="text-[10px] font-mono text-red-500" data-testid="otp-error">{otpError}</p>
                  )}

                  <button
                    onClick={handleVerify}
                    disabled={submitting || otp.length !== 6}
                    data-testid="signup-verify-btn"
                    className="w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Creating Account...' : 'Verify & Create Account'}
                  </button>

                  <button
                    onClick={() => {
                      const code = generateOTP();
                      setGeneratedOtp(code);
                      sendVerificationEmail(email.trim(), code);
                      setOtpError('');
                    }}
                    className="w-full text-xs font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest"
                  >
                    Resend Code
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