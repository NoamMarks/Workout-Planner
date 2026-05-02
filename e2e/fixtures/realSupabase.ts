import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Real Supabase test harness.
 *
 * The RLS pen-test suite cannot use the mock layer — it has to query the
 * actual Postgres engine to verify the actual policies. This helper:
 *
 *   1. Loads .env so process.env carries VITE_SUPABASE_URL and
 *      SUPABASE_SERVICE_ROLE_KEY without requiring the user to export them.
 *   2. Exposes `provisionUser` to mint coaches / trainees via the
 *      service-role admin API (with email_confirm: true so they can sign
 *      in immediately).
 *   3. Exposes `cleanupUser` to delete a provisioned user — guaranteed to
 *      run in afterAll regardless of test outcome.
 *
 * Created users carry an `IRONTRACK_PENTEST_PREFIX`-tagged email so a
 * forgotten cleanup leaves an obvious paper trail that's safe to wipe by
 * hand later.
 */

const IRONTRACK_PENTEST_PREFIX = 'irontrack-pentest-';
const PASSWORD = 'PenTest1!';

/** Load .env into process.env without adding a runtime dep. Idempotent. */
function loadDotEnv() {
  if (process.env.__IRONTRACK_DOTENV_LOADED__) return;
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    process.env.__IRONTRACK_DOTENV_LOADED__ = '1';
  } catch {
    // .env not present — process.env may still be populated by the shell.
  }
}

export interface RealEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function readRealEnv(): RealEnv | null {
  loadDotEnv();
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

export function adminClient(env: RealEnv): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(env: RealEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ProvisionedUser {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'trainee' | 'superadmin';
  tenantId: string | null;
}

/**
 * Mint a real auth.users + profiles row for use in pen-tests.
 *   - For role='admin', tenantId is set to the new user's own id (coach is
 *     root of own tenant).
 *   - For role='trainee', the caller MUST pass a tenantId (an existing
 *     coach's id).
 */
export async function provisionUser(
  admin: SupabaseClient,
  opts: {
    role: 'admin' | 'trainee' | 'superadmin';
    tenantId?: string;
    label?: string; // e.g. 'coachA' — embedded in email for log readability
  },
): Promise<ProvisionedUser> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const label = opts.label ?? opts.role;
  const email = `${IRONTRACK_PENTEST_PREFIX}${label}-${stamp}@irontrack.test`;
  const name = `Pentest ${label}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      name,
      role: opts.role,
      ...(opts.tenantId ? { tenant_id: opts.tenantId } : {}),
    },
  });
  if (error || !data.user) {
    throw new Error(`provisionUser(${label}): ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;
  const tenantIdForProfile =
    opts.role === 'admin'
      ? userId
      : opts.role === 'superadmin'
        ? null
        : opts.tenantId ?? null;

  const { error: updateErr } = await admin
    .from('profiles')
    .update({ name, role: opts.role, tenant_id: tenantIdForProfile })
    .eq('id', userId);
  if (updateErr) {
    // Best-effort cleanup before throwing.
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new Error(`provisionUser(${label}) profile update: ${updateErr.message}`);
  }

  return {
    id: userId,
    email,
    password: PASSWORD,
    role: opts.role,
    tenantId: tenantIdForProfile,
  };
}

/** Best-effort cleanup. Never throws — afterAll must always complete. */
export async function cleanupUser(
  admin: SupabaseClient,
  user: ProvisionedUser | null,
): Promise<void> {
  if (!user) return;
  try {
    await admin.auth.admin.deleteUser(user.id);
  } catch (err) {
    // The auth.users CASCADE drops the profiles row, so a partial failure
    // is rare. Log and move on so the rest of the cleanup completes.
    console.warn(`cleanupUser(${user.email}) failed`, err);
  }
}

/** Sign in as a provisioned user. Returns the access token to use as the
 *  Bearer in Authorization headers when hitting our own /api/* routes. */
export async function signIn(
  env: RealEnv,
  user: ProvisionedUser,
): Promise<{ accessToken: string; client: SupabaseClient }> {
  const client = userClient(env);
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`signIn(${user.email}): ${error?.message ?? 'no session'}`);
  }
  return { accessToken: data.session.access_token, client };
}

/** Provision a coach + invite code in one shot — the invite is the
 *  prerequisite for spinning up a trainee in the coach's tenant. */
export async function provisionCoachWithInvite(
  admin: SupabaseClient,
  label: string,
): Promise<{ coach: ProvisionedUser; inviteCode: string; inviteId: string }> {
  const coach = await provisionUser(admin, { role: 'admin', label });
  const code = `PEN${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const { data, error } = await admin
    .from('invite_codes')
    .insert({
      code,
      coach_id: coach.id,
      tenant_id: coach.id,
      coach_name: `Pentest ${label}`,
      use_count: 0,
    })
    .select('id, code')
    .single<{ id: string; code: string }>();
  if (error || !data) {
    await cleanupUser(admin, coach);
    throw new Error(`provisionCoachWithInvite(${label}): ${error?.message ?? 'no invite returned'}`);
  }
  return { coach, inviteCode: data.code, inviteId: data.id };
}

export { IRONTRACK_PENTEST_PREFIX, PASSWORD };
