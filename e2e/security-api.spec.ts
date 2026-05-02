import { test, expect } from '@playwright/test';
import {
  readRealEnv,
  adminClient,
  provisionUser,
  provisionCoachWithInvite,
  cleanupUser,
  signIn,
  type ProvisionedUser,
} from './fixtures/realSupabase';

/**
 * /api/admin-create-user authentication & authorization pen-tests.
 *
 * The endpoint mints coach (admin) accounts via service-role privileges. If
 * its auth gate is broken, anyone with the URL can mint coaches. We probe:
 *
 *   - missing Authorization header        → 401
 *   - garbage / malformed bearer token    → 401
 *   - valid trainee JWT                   → 403  (real Supabase)
 *   - valid admin JWT                     → 200  (sanity check, real Supabase)
 *
 * The 403/200 cases require real auth.users entries. We provision them via
 * the service role at test setup and delete them in afterAll.
 */

const env = readRealEnv();
const HAS_REAL = !!env;

test.describe('Security API — auth gate (no real Supabase needed)', () => {
  test('POST /api/admin-create-user with no Authorization header → 401', async ({ request }) => {
    const res = await request.post('/api/admin-create-user', {
      data: { name: 'Mallory', email: 'mallory@example.com', password: 'Whatever1!' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authorization|missing|invalid/i);
  });

  test('POST /api/admin-create-user with empty Bearer → 401', async ({ request }) => {
    const res = await request.post('/api/admin-create-user', {
      headers: { Authorization: 'Bearer ' },
      data: { name: 'Mallory', email: 'mallory2@example.com', password: 'Whatever1!' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin-create-user with malformed JWT → 401', async ({ request }) => {
    const res = await request.post('/api/admin-create-user', {
      headers: { Authorization: 'Bearer not.a.jwt' },
      data: { name: 'Mallory', email: 'mallory3@example.com', password: 'Whatever1!' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin-create-user with non-Bearer scheme → 401', async ({ request }) => {
    const res = await request.post('/api/admin-create-user', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      data: { name: 'Mallory', email: 'mallory4@example.com', password: 'Whatever1!' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/signup-user with missing inviteCode → 400 + structured error', async ({ request }) => {
    // Closes the historical hole where signup-user accepted any tenantId
    // without verifying the invite — anyone could mint trainees in any
    // coach's tenant by guessing tenant uuids.
    const res = await request.post('/api/signup-user', {
      data: {
        name: 'Mallory',
        email: 'mallory-signup@example.com',
        password: 'Whatever1!',
        tenantId: 'whatever-uuid',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inviteCode|missing|invalid/i);
  });

  test('POST /api/signup-user with bogus inviteCode → 400 (rejected before user creation)', async ({ request }) => {
    const res = await request.post('/api/signup-user', {
      data: {
        name: 'Mallory',
        email: 'mallory-bogus@example.com',
        password: 'Whatever1!',
        tenantId: '00000000-0000-0000-0000-000000000000',
        inviteCode: 'NOT_A_REAL_CODE',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid invite/i);
  });
});

test.describe(`Security API — real-user role gating ${HAS_REAL ? '' : '(SKIPPED — no Supabase env)'}`, () => {
  test.skip(!HAS_REAL, 'VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  // Provision once; reuse across tests in the describe block.
  let coach: ProvisionedUser | null = null;
  let trainee: ProvisionedUser | null = null;
  let inviteId: string | null = null;
  let coachAccessToken = '';
  let traineeAccessToken = '';

  test.beforeAll(async () => {
    if (!env) return;
    const admin = adminClient(env);
    const provisioned = await provisionCoachWithInvite(admin, 'apiCoach');
    coach = provisioned.coach;
    inviteId = provisioned.inviteId;
    trainee = await provisionUser(admin, {
      role: 'trainee',
      tenantId: coach.id,
      label: 'apiTrainee',
    });
    coachAccessToken = (await signIn(env, coach)).accessToken;
    traineeAccessToken = (await signIn(env, trainee)).accessToken;
  });

  test.afterAll(async () => {
    if (!env) return;
    const admin = adminClient(env);
    if (inviteId) {
      await admin.from('invite_codes').delete().eq('id', inviteId).then(() => undefined, () => undefined);
    }
    await cleanupUser(admin, trainee);
    await cleanupUser(admin, coach);
  });

  test('POST /api/admin-create-user with TRAINEE Bearer → 403 (role escalation refused)', async ({ request }) => {
    expect(traineeAccessToken).not.toEqual('');
    const res = await request.post('/api/admin-create-user', {
      headers: { Authorization: `Bearer ${traineeAccessToken}` },
      data: {
        name: 'New Mole Coach',
        email: `mole-${Date.now()}@irontrack.test`,
        password: 'WouldNeverWork1!',
      },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden|admin|superadmin/i);
  });

  test('POST /api/admin-create-user with ADMIN Bearer → 200 (sanity: gate doesn\'t block legitimate callers)', async ({ request }) => {
    expect(coachAccessToken).not.toEqual('');
    const newEmail = `pentest-spawned-coach-${Date.now()}@irontrack.test`;
    const res = await request.post('/api/admin-create-user', {
      headers: { Authorization: `Bearer ${coachAccessToken}` },
      data: { name: 'Spawned Coach', email: newEmail, password: 'PenTest1!' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile?.email).toBe(newEmail);

    // Cleanup the spawned coach.
    if (env && body.profile?.id) {
      await adminClient(env).auth.admin.deleteUser(body.profile.id).catch(() => undefined);
    }
  });
});
