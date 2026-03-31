/**
 * Client-side password hashing using the Web Crypto API (SHA-256).
 *
 * Passwords are hashed before being written to localStorage so that
 * the plaintext is never persisted. Comparison at login time hashes
 * the submitted password and compares the digests.
 *
 * NOTE: SHA-256 without a salt is not a substitute for a proper backend
 * auth system (bcrypt / argon2 + server-side secrets). Use a real backend
 * for production deployments.
 */

/** Return a hex-encoded SHA-256 digest of the input string. */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns true if the string looks like a SHA-256 hex digest (64 hex chars). */
export function isHashed(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Minimum-requirements check for new passwords. */
export interface PasswordStrength {
  ok: boolean;
  errors: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const errors: string[] = [];
  if (password.length < 8)        errors.push('At least 8 characters');
  if (!/[a-zA-Z]/.test(password)) errors.push('At least one letter');
  if (!/[0-9]/.test(password))    errors.push('At least one number');
  return { ok: errors.length === 0, errors };
}
