/**
 * Shared input validators used across auth + admin forms.
 *
 * Email regex covers the practical cases (anything@anything.something with no
 * whitespace and exactly one '@') without trying to encode the full RFC-5322
 * grammar — the cost of false negatives on weird-but-valid addresses outweighs
 * the marginal accuracy of a 200-char regex.
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Standard error message used wherever email format validation runs. */
export const INVALID_EMAIL_MESSAGE = 'Please enter a valid email address.';
