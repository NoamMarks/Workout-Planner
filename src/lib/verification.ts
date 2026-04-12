/**
 * OTP Verification Service
 *
 * Generates 6-digit codes and delivers them via Resend API when configured,
 * falling back to console log when the API key is absent.
 */

import { sendVerificationEmailViaResend, sendPasswordResetEmailViaResend } from './email';

/** Generate a random 6-digit numeric code. */
export function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send a signup verification email.
 * Uses Resend when VITE_RESEND_API_KEY is set, otherwise logs to console.
 */
export function sendVerificationEmail(email: string, code: string): void {
  void sendVerificationEmailViaResend(email, code);
}

// ─── Reset Token Service ────────────────────────────────────────────────────

const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface ResetToken {
  code: string;
  email: string;
  createdAt: number;
  used: boolean;
}

/** In-memory store — tokens don't survive page refresh (intentionally safe). */
const tokenStore: ResetToken[] = [];

/** Visible for testing — returns the internal store reference. */
export function _getTokenStore(): ResetToken[] {
  return tokenStore;
}

/** Clear all tokens (useful in tests). */
export function _clearTokenStore(): void {
  tokenStore.length = 0;
}

/**
 * Create a reset token for the given email.
 * Invalidates any previous unused tokens for the same email.
 */
export function createResetToken(email: string): ResetToken {
  // Invalidate previous tokens for this email
  for (const t of tokenStore) {
    if (t.email === email && !t.used) t.used = true;
  }
  const token: ResetToken = {
    code: generateOTP(),
    email: email.toLowerCase().trim(),
    createdAt: Date.now(),
    used: false,
  };
  tokenStore.push(token);
  return token;
}

/**
 * Validate a reset code for a given email.
 * Returns true only if the code matches, is not expired, and has not been used.
 */
export function validateResetToken(email: string, code: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  const token = tokenStore.find(
    (t) => t.email === normalizedEmail && t.code === code && !t.used
  );
  if (!token) return false;
  if (Date.now() - token.createdAt > RESET_TOKEN_TTL_MS) return false;
  return true;
}

/**
 * Consume (invalidate) a reset token after a successful password change.
 */
export function consumeResetToken(email: string, code: string): void {
  const normalizedEmail = email.toLowerCase().trim();
  const token = tokenStore.find(
    (t) => t.email === normalizedEmail && t.code === code && !t.used
  );
  if (token) token.used = true;
}

/**
 * Send a password reset email.
 * Uses Resend when VITE_RESEND_API_KEY is set, otherwise logs to console.
 */
export function sendPasswordResetEmail(email: string, code: string): void {
  void sendPasswordResetEmailViaResend(email, code);
}