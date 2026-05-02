/**
 * Vercel Serverless Function: POST /api/signup-user
 *
 * Self-service trainee signup. The browser cannot pass `email_confirm: true`
 * to supabase.auth.admin.createUser (that requires the service-role key), so
 * regular supabase.auth.signUp() always leaves the account in an unconfirmed
 * state when the project has Email Confirmation enabled. This endpoint
 * shortcuts the confirmation step so the user can log in immediately after
 * entering their OTP, while keeping the service-role key off the client.
 *
 * Server-side invite verification:
 *   The caller passes BOTH `tenantId` and `inviteCode`. Before creating any
 *   auth user, this function looks up the invite_codes row by code and
 *   asserts that (a) it exists, (b) its tenant_id matches the requested
 *   tenantId, and (c) it is not exhausted. Without this gate, any
 *   unauthenticated client could mint trainees in arbitrary tenants by
 *   guessing tenant uuids — an authentication-free privilege escalation.
 *
 * Required Vercel env vars (server-only — no VITE_ prefix on the secret):
 *   VITE_SUPABASE_URL          Project URL (also used by the browser bundle).
 *   SUPABASE_SERVICE_ROLE_KEY  Service-role key. NEVER expose to the browser.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface SignupPayload {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  tenantId?: unknown;
  inviteCode?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeInviteCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[signup-user] missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Signup is not configured.' });
  }

  const body = (req.body ?? {}) as SignupPayload;
  if (
    !isString(body.name) ||
    !isString(body.email) ||
    !isString(body.password) ||
    !isString(body.tenantId) ||
    !isString(body.inviteCode)
  ) {
    return res.status(400).json({
      error: 'Missing or invalid fields: name, email, password, tenantId, inviteCode',
    });
  }

  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  const tenantId = body.tenantId.trim();
  const inviteCode = normalizeInviteCode(body.inviteCode);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Server-side invite verification ────────────────────────────────────
  // Use the service-role client (RLS bypassed) to look up the invite by
  // code. Then enforce the tenant match + use cap. Done BEFORE we touch
  // auth.users so a rejected invite doesn't pollute the auth table.
  const { data: invite, error: inviteErr } = await supabase
    .from('invite_codes')
    .select('id, tenant_id, max_uses, use_count')
    .eq('code', inviteCode)
    .maybeSingle<{ id: string; tenant_id: string; max_uses: number | null; use_count: number | null }>();

  if (inviteErr) {
    console.error('[signup-user] invite lookup failed', inviteErr);
    return res.status(500).json({ error: 'Could not verify invite.' });
  }
  if (!invite) {
    return res.status(400).json({ error: 'Invalid invite code.' });
  }
  if (invite.tenant_id !== tenantId) {
    // Caller tried to redirect a real invite at a different tenant —
    // refuse, log loudly enough to investigate but don't leak which side
    // mismatched (could be either a stale UI or an attacker).
    console.warn('[signup-user] invite tenant mismatch', {
      inviteId: invite.id,
      requestedTenantId: tenantId,
    });
    return res.status(400).json({ error: 'Invalid invite code.' });
  }
  if (
    invite.max_uses != null &&
    invite.max_uses > 0 &&
    (invite.use_count ?? 0) >= invite.max_uses
  ) {
    return res.status(400).json({ error: 'This invite code has been used up.' });
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'trainee', tenant_id: tenantId },
    });

    if (error || !data?.user) {
      console.error('[signup-user] createUser failed', error);
      return res.status(400).json({ error: error?.message ?? 'Failed to create user.' });
    }

    const userId = data.user.id;

    // The on_auth_user_created trigger has just inserted the profiles row.
    // Some triggers don't pick up user_metadata reliably, so write the
    // tenant_id / role / name explicitly. The browser will then sign in
    // with email+password and onAuthStateChange will hydrate authenticatedUser.
    const { data: profile, error: updateErr } = await supabase
      .from('profiles')
      .update({ tenant_id: tenantId, name, role: 'trainee' })
      .eq('id', userId)
      .select('id, name, email, role, tenant_id, active_program_id')
      .single();

    if (updateErr || !profile) {
      console.error('[signup-user] profile update failed', updateErr);
      return res.status(500).json({
        error: updateErr?.message ?? 'Auth user created but profile update failed.',
      });
    }

    return res.status(200).json({ profile });
  } catch (err) {
    console.error('[signup-user] unexpected failure', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return res.status(500).json({ error: message });
  }
}
