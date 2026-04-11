/**
 * Invite Code management — persisted in localStorage.
 * Each code is permanently linked to a Coach's tenantId.
 */

import type { InviteCode } from '../types';

const STORAGE_KEY = 'irontrack_invite_codes';

function loadCodes(): InviteCode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InviteCode[]) : [];
  } catch {
    return [];
  }
}

function saveCodes(codes: InviteCode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

/** Generate a short, unique, human-readable invite code. */
function makeCode(): string {
  // 8 alphanumeric chars, uppercase for readability
  return Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => b.toString(36).toUpperCase().padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

/** Create a new invite code for a coach. */
export function createInviteCode(coachId: string, tenantId: string): InviteCode {
  const codes = loadCodes();
  const invite: InviteCode = {
    id: Math.random().toString(36).substring(2, 9),
    code: makeCode(),
    tenantId,
    coachId,
    createdAt: new Date().toISOString(),
  };
  saveCodes([...codes, invite]);
  return invite;
}

/** Get all invite codes for a specific coach. */
export function getInviteCodesForCoach(coachId: string): InviteCode[] {
  return loadCodes().filter((c) => c.coachId === coachId);
}

/** Look up an invite code by the code string. Returns null if not found. */
export function lookupInviteCode(code: string): InviteCode | null {
  const normalized = code.trim().toUpperCase();
  return loadCodes().find((c) => c.code === normalized) ?? null;
}

/** Delete an invite code. */
export function deleteInviteCode(codeId: string): void {
  saveCodes(loadCodes().filter((c) => c.id !== codeId));
}