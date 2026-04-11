import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createResetToken,
  validateResetToken,
  consumeResetToken,
  _clearTokenStore,
} from '../lib/verification';

describe('Reset Token Service', () => {
  beforeEach(() => {
    _clearTokenStore();
    vi.restoreAllMocks();
  });

  it('generates a 6-digit code', () => {
    const token = createResetToken('user@test.com');
    expect(token.code).toMatch(/^\d{6}$/);
    expect(token.email).toBe('user@test.com');
    expect(token.used).toBe(false);
  });

  it('validates a fresh token', () => {
    const token = createResetToken('user@test.com');
    expect(validateResetToken('user@test.com', token.code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    createResetToken('user@test.com');
    expect(validateResetToken('user@test.com', '000000')).toBe(false);
  });

  it('rejects a code for the wrong email', () => {
    const token = createResetToken('user@test.com');
    expect(validateResetToken('other@test.com', token.code)).toBe(false);
  });

  it('invalidates a token after consumption', () => {
    const token = createResetToken('user@test.com');
    consumeResetToken('user@test.com', token.code);
    expect(validateResetToken('user@test.com', token.code)).toBe(false);
  });

  it('invalidates previous tokens for the same email when a new one is created', () => {
    const token1 = createResetToken('user@test.com');
    const token2 = createResetToken('user@test.com');
    expect(validateResetToken('user@test.com', token1.code)).toBe(false);
    expect(validateResetToken('user@test.com', token2.code)).toBe(true);
  });

  it('rejects an expired token (>10 minutes)', () => {
    const token = createResetToken('user@test.com');

    // Fast-forward Date.now by 11 minutes
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 11 * 60 * 1000);

    expect(validateResetToken('user@test.com', token.code)).toBe(false);
  });

  it('accepts a token just under 10 minutes', () => {
    const token = createResetToken('user@test.com');

    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 9 * 60 * 1000);

    expect(validateResetToken('user@test.com', token.code)).toBe(true);
  });

  it('normalises email to lowercase', () => {
    const token = createResetToken('User@Test.COM');
    expect(validateResetToken('user@test.com', token.code)).toBe(true);
  });
});