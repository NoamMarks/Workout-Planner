import { test, expect } from '@playwright/test';
import {
  readRealEnv,
  adminClient,
  userClient,
  provisionUser,
  provisionCoachWithInvite,
  cleanupUser,
  type ProvisionedUser,
} from './fixtures/realSupabase';

/**
 * Row Level Security pen-tests.
 *
 * RLS is a Postgres feature; mocked tests can't validate it. These tests
 * provision real users via the service role and then attempt to bypass the
 * isolation policies in supabase/schema.sql using the actual RLS-bound
 * REST API. If any test successfully reads or writes data outside its
 * tenant, the test FAILS and the schema needs to be hardened immediately.
 *
 * Tenant topology used here:
 *
 *   Coach A (admin) ── tenant_a
 *     └─ Trainee A (trainee, tenant_id = coach_a.id)
 *
 *   Coach B (admin) ── tenant_b
 *     └─ Trainee B (trainee, tenant_id = coach_b.id)
 *
 * Provisioned in beforeAll, deleted in afterAll. All test users carry the
 * `irontrack-pentest-` email prefix so any orphan from a crashed run is
 * trivially identifiable.
 */

const env = readRealEnv();
const HAS_REAL = !!env;

test.describe(`Security RLS — ${HAS_REAL ? 'real Supabase' : 'SKIPPED (no env)'}`, () => {
  test.skip(!HAS_REAL, 'VITE_SUPABASE_URL + ANON + SERVICE_ROLE required');

  let coachA: ProvisionedUser | null = null;
  let coachB: ProvisionedUser | null = null;
  let traineeA: ProvisionedUser | null = null;
  let traineeB: ProvisionedUser | null = null;
  let inviteAId: string | null = null;
  let inviteBId: string | null = null;
  let inviteACode: string | null = null;
  // Programs created by service role — used as cross-tenant probe targets.
  let programAId: string | null = null;
  let programBId: string | null = null;
  // Set in beforeAll if the security_hardening migration hasn't been
  // applied to the live Supabase project yet. Each test that depends on
  // it begins with `test.skip(migrationPending, ...)`.
  let migrationPending: { reason: string } | null = null;

  test.beforeAll(async () => {
    if (!env) return;
    const admin = adminClient(env);

    // Probe whether supabase/migrations/2026-05-02_security_hardening.sql
    // has been applied. We call increment_invite_usage('') — under the
    // current schema this must return `false` cleanly. If we instead get
    // an error like `relation "public.invites" does not exist`, the RPC
    // body is the pre-migration version and the user still needs to paste
    // the migration into the Supabase SQL editor.
    const probe = await admin.rpc('increment_invite_usage', { invite_code: '' });
    if (probe.error) {
      migrationPending = {
        reason:
          'supabase/migrations/2026-05-02_security_hardening.sql has not been applied to the live project. ' +
          `RPC probe error: ${probe.error.message}`,
      };
    }

    const provA = await provisionCoachWithInvite(admin, 'rlsCoachA');
    coachA = provA.coach;
    inviteAId = provA.inviteId;
    inviteACode = provA.inviteCode;

    const provB = await provisionCoachWithInvite(admin, 'rlsCoachB');
    coachB = provB.coach;
    inviteBId = provB.inviteId;

    traineeA = await provisionUser(admin, {
      role: 'trainee',
      tenantId: coachA.id,
      label: 'rlsTraineeA',
    });
    traineeB = await provisionUser(admin, {
      role: 'trainee',
      tenantId: coachB.id,
      label: 'rlsTraineeB',
    });

    // Seed one program per coach so the tenant-isolation queries have
    // something to find (or fail to find).
    const { data: progA, error: progAErr } = await admin
      .from('programs')
      .insert({
        client_id: traineeA.id,
        tenant_id: coachA.id,
        name: 'RLS Probe — Coach A Program',
      })
      .select('id')
      .single<{ id: string }>();
    if (progAErr || !progA) throw progAErr ?? new Error('seed program A failed');
    programAId = progA.id;

    const { data: progB, error: progBErr } = await admin
      .from('programs')
      .insert({
        client_id: traineeB.id,
        tenant_id: coachB.id,
        name: 'RLS Probe — Coach B Program',
      })
      .select('id')
      .single<{ id: string }>();
    if (progBErr || !progB) throw progBErr ?? new Error('seed program B failed');
    programBId = progB.id;
  });

  test.afterAll(async () => {
    if (!env) return;
    const admin = adminClient(env);
    // Programs cascade through profiles cleanup, but be explicit.
    if (programAId) await admin.from('programs').delete().eq('id', programAId).then(() => undefined, () => undefined);
    if (programBId) await admin.from('programs').delete().eq('id', programBId).then(() => undefined, () => undefined);
    if (inviteAId) await admin.from('invite_codes').delete().eq('id', inviteAId).then(() => undefined, () => undefined);
    if (inviteBId) await admin.from('invite_codes').delete().eq('id', inviteBId).then(() => undefined, () => undefined);
    await cleanupUser(admin, traineeA);
    await cleanupUser(admin, traineeB);
    await cleanupUser(admin, coachA);
    await cleanupUser(admin, coachB);
  });

  // ── Tenant isolation: profiles ──────────────────────────────────────────
  test('Coach A reading profiles by tenant_id=B sees only their own tenant rows (zero of B\'s)', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    const auth = await client.auth.signInWithPassword({ email: coachA!.email, password: coachA!.password });
    expect(auth.error).toBeNull();

    // Try the textbook attack: filter directly by the OTHER tenant's id.
    const { data, error } = await client
      .from('profiles')
      .select('id, name, email, tenant_id')
      .eq('tenant_id', coachB!.id);

    // RLS filters BEFORE the eq; the result must be empty (or an explicit
    // RLS error, but Postgrest typically silently filters).
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ── Tenant isolation: programs ──────────────────────────────────────────
  test('Coach A querying programs by id=<B program> returns zero rows', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: coachA!.email, password: coachA!.password });

    const { data, error } = await client
      .from('programs')
      .select('id, name, tenant_id')
      .eq('id', programBId!);

    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ── Tenant isolation: invite_codes ──────────────────────────────────────
  test('Coach A querying invite_codes by coach_id=B returns zero rows', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: coachA!.email, password: coachA!.password });

    // The authenticated SELECT policy on invite_codes filters to coach_id =
    // auth.uid(). Coach A asking for Coach B's invites must come back empty.
    // (Note: there's a separate `to anon` policy that allows lookup by code
    // for the unauthenticated signup form; we're not testing that path here.)
    const { data, error } = await client
      .from('invite_codes')
      .select('id, code, coach_id')
      .eq('coach_id', coachB!.id);

    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ── Trainee role escalation: cannot create a program ────────────────────
  test('Trainee cannot INSERT into programs (RLS write rejection)', async () => {
    test.skip(!!migrationPending, migrationPending?.reason ?? '');
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: traineeA!.email, password: traineeA!.password });

    const { data, error } = await client.from('programs').insert({
      client_id: traineeA!.id,
      tenant_id: coachA!.id, // even within their own tenant — trainees can't author programs
      name: 'Trainee-spawned program (should be rejected)',
    }).select();

    // Either an error is set, or the data is empty. We accept either as
    // "RLS denied". We REJECT the case where data has a row.
    expect(data ?? []).toEqual([]);
    if (!error) {
      // Some Postgrest configurations silently no-op the insert. Confirm
      // the row really isn't there.
      const admin = adminClient(env!);
      const { data: leaked } = await admin
        .from('programs')
        .select('id')
        .eq('name', 'Trainee-spawned program (should be rejected)');
      expect(leaked ?? []).toEqual([]);
    }
  });

  // ── Trainee role escalation: cannot update another trainee's data ───────
  test('Trainee A cannot UPDATE Trainee B\'s profile (cross-tenant write rejection)', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: traineeA!.email, password: traineeA!.password });

    const { data, error } = await client
      .from('profiles')
      .update({ name: 'PWNED by Trainee A' })
      .eq('id', traineeB!.id)
      .select();

    expect(data ?? []).toEqual([]);

    // Re-read via service role to confirm Trainee B's name is intact.
    const admin = adminClient(env!);
    const { data: bAfter } = await admin
      .from('profiles')
      .select('name')
      .eq('id', traineeB!.id)
      .single<{ name: string }>();
    expect(bAfter?.name).not.toBe('PWNED by Trainee A');
    void error;
  });

  // ── Trainee role escalation: cannot DELETE invite_codes ─────────────────
  test('Trainee cannot DELETE invite_codes belonging to their own coach', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: traineeA!.email, password: traineeA!.password });

    await client.from('invite_codes').delete().eq('id', inviteAId!);

    // Confirm the invite still exists via service role.
    const admin = adminClient(env!);
    const { data, error } = await admin
      .from('invite_codes')
      .select('id')
      .eq('id', inviteAId!)
      .single<{ id: string }>();
    expect(error).toBeNull();
    expect(data?.id).toBe(inviteAId);
  });

  // ── increment_invite_usage RPC: SECURITY DEFINER allowed by design ──────
  test('increment_invite_usage RPC: trainee can call it (intended), but it only bumps the counter', async () => {
    test.skip(!!migrationPending, migrationPending?.reason ?? '');
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: traineeA!.email, password: traineeA!.password });

    // Read use_count via service role for before/after compare.
    const admin = adminClient(env!);
    const { data: before } = await admin
      .from('invite_codes')
      .select('use_count')
      .eq('id', inviteAId!)
      .single<{ use_count: number }>();
    const startCount = before?.use_count ?? 0;

    const { data: ok, error } = await client.rpc('increment_invite_usage', {
      invite_code: inviteACode!,
    });
    expect(error).toBeNull();
    expect(ok).toBe(true);

    const { data: after } = await admin
      .from('invite_codes')
      .select('use_count')
      .eq('id', inviteAId!)
      .single<{ use_count: number }>();
    expect(after?.use_count).toBe(startCount + 1);
  });

  test('increment_invite_usage RPC ignores empty / unknown codes (returns false, no row touched)', async () => {
    test.skip(!!migrationPending, migrationPending?.reason ?? '');
    expect(env).not.toBeNull();
    const client = userClient(env!);
    await client.auth.signInWithPassword({ email: traineeA!.email, password: traineeA!.password });

    const { data: ok1, error: err1 } = await client.rpc('increment_invite_usage', { invite_code: '' });
    expect(err1).toBeNull();
    expect(ok1).toBe(false);

    const { data: ok2, error: err2 } = await client.rpc('increment_invite_usage', {
      invite_code: 'DEFINITELY-NOT-A-REAL-CODE',
    });
    expect(err2).toBeNull();
    expect(ok2).toBe(false);
  });

  // ── Anon path: unauthenticated lookup of invite by code IS allowed ──────
  test('Anon client can SELECT invite_codes by code (intended for signup form)', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    // No signInWithPassword — pure anon.
    const { data, error } = await client
      .from('invite_codes')
      .select('id, tenant_id')
      .eq('code', inviteACode!)
      .maybeSingle<{ id: string; tenant_id: string }>();
    expect(error).toBeNull();
    expect(data?.id).toBe(inviteAId);
  });

  // ── Anon path: unauthenticated cannot list profiles ─────────────────────
  test('Anon client cannot SELECT profiles', async () => {
    expect(env).not.toBeNull();
    const client = userClient(env!);
    const { data, error } = await client.from('profiles').select('id');
    // RLS on profiles requires authenticated; anon gets either an error or
    // an empty array depending on Postgrest config — both are "denied".
    if (!error) {
      expect(data ?? []).toEqual([]);
    }
  });
});
