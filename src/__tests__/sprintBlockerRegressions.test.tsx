/**
 * Pre-Sprint-5 blocker regressions:
 *  Bug 1 — invite codes with maxUses == null (undefined OR null OR 0) must
 *          NEVER show as expired and must always pass lookup.
 *  Bug 2 — AddClientModal must NOT freeze on "Creating..." when addClient
 *          throws; the submitting flag must reset and the error must surface.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddClientModal } from '../App';
import {
  createInviteCode,
  lookupInviteCode,
  consumeInviteCode,
} from '../lib/inviteCodes';
import type { Client, InviteCode } from '../types';

beforeEach(() => {
  localStorage.clear();
});

// ─── Bug 1: maxUses semantics ───────────────────────────────────────────────

describe('invite-code maxUses == null / undefined / 0 → unlimited', () => {
  it('createInviteCode without maxUses → lookup succeeds repeatedly', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha');
    expect(inv.maxUses).toBeUndefined();
    expect(lookupInviteCode(inv.code)).toBeTruthy();
    consumeInviteCode(inv.code);
    consumeInviteCode(inv.code);
    expect(lookupInviteCode(inv.code)).toBeTruthy();
  });

  it('legacy stored record with maxUses === null still validates as unlimited', () => {
    // Simulate stale localStorage from an older serialization that stored null
    // explicitly instead of dropping the key.
    const legacy: InviteCode = {
      id: 'leg1',
      code: 'LEGACY01',
      tenantId: 'tenant-A',
      coachId: 'coach1',
      coachName: 'Coach',
      createdAt: new Date().toISOString(),
      // @ts-expect-error — testing legacy null value
      maxUses: null,
      useCount: 0,
    };
    localStorage.setItem('irontrack_invite_codes', JSON.stringify([legacy]));
    expect(lookupInviteCode('LEGACY01')).toBeTruthy();
  });

  it('a 0/zero maxUses is treated as unlimited rather than always-expired', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha', 0);
    expect(lookupInviteCode(inv.code)).toBeTruthy();
  });

  it('explicit maxUses=1 still expires after one use (cap is honoured)', () => {
    const inv = createInviteCode('coach1', 'tenant-A', 'Coach Alpha', 1);
    expect(lookupInviteCode(inv.code)).toBeTruthy();
    consumeInviteCode(inv.code);
    expect(lookupInviteCode(inv.code)).toBeNull();
  });
});

// ─── Bug 2: AddClientModal does not freeze on rejection ─────────────────────

function fillModal() {
  fireEvent.change(screen.getByTestId('new-client-name'),     { target: { value: 'New Trainee' } });
  fireEvent.change(screen.getByTestId('new-client-email'),    { target: { value: 'trainee@new.com' } });
  fireEvent.change(screen.getByTestId('new-client-password'), { target: { value: 'Password1' } });
  fireEvent.change(screen.getByTestId('new-client-confirm'),  { target: { value: 'Password1' } });
}

describe('AddClientModal handles addClient rejection without freezing', () => {
  it('clears the submitting state and surfaces the error when addClient throws', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('addClient: trainee creation requires a tenantId'));
    const onClose = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AddClientModal isOpen={true} onClose={onClose} onAdd={onAdd} tenantId="tenant-A" />);

    fillModal();
    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    // After the rejection settles:
    //  - the button label has reverted from "Creating..." to "Create Client"
    //  - the error message is visible
    //  - onClose has NOT been called (modal stays open so the user sees the error)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create client/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /creating/i })).toBeNull();
    expect(screen.getByText(/trainee creation requires a tenantId/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledOnce();

    errSpy.mockRestore();
  });

  it('passes the tenantId argument explicitly to addClient', async () => {
    const fakeClient: Client = {
      id: 'new1',
      name: 'New Trainee',
      email: 'trainee@new.com',
      role: 'trainee',
      tenantId: 'tenant-A',
      programs: [],
    };
    const onAdd = vi.fn().mockResolvedValue(fakeClient);
    const onClose = vi.fn();

    render(<AddClientModal isOpen={true} onClose={onClose} onAdd={onAdd} tenantId="tenant-A" />);

    fillModal();
    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onAdd).toHaveBeenCalledWith('New Trainee', 'trainee@new.com', 'Password1', 'trainee', 'tenant-A');
  });

  it('refuses to submit and shows an inline error when no tenantId is provided', () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(<AddClientModal isOpen={true} onClose={onClose} onAdd={onAdd} tenantId={undefined} />);

    fillModal();
    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    // onAdd never invoked — guard fired before the submit
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/missing a tenant/i)).toBeInTheDocument();
  });
});
