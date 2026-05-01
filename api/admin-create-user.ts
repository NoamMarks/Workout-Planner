/**
 * Vercel Serverless Function: POST /api/admin-create-user
 *
 * Server-side coach (admin) creation. The browser cannot call
 * `supabase.auth.admin.createUser` because it requires the service-role key.
 * The superadmin UI POSTs `{ name, email, password }` here; this function
 * provisions the auth user, lets the on_auth_user_created trigger build the
 * profiles row, then patches that profile so its tenant_id points at itself
 * (a coach is the root of their own tenant).
 *
 * Required Vercel env vars (NOT prefixed with VITE_ — must stay server-only):
 *   VITE_SUPABASE_URL         Project URL (re-used by the server runtime).
 *   SUPABASE_SERVICE_ROLE_KEY Service-role key. NEVER expose to the browser.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface CreateCoachPayload {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    console.error('[admin-create-user] missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Admin create-user is not configured.' });
  }

  const body = (req.body ?? {}) as CreateCoachPayload;
  if (!isString(body.name) || !isString(body.email) || !isString(body.password)) {
    return res.status(400).json({ error: 'Missing or invalid fields: name, email, password' });
  }

  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'admin' },
    });

    if (error || !data?.user) {
      console.error('[admin-create-user] createUser failed', error);
      const message = error?.message ?? 'Failed to create user.';
      return res.status(400).json({ error: message });
    }

    const userId = data.user.id;

    // The on_auth_user_created trigger has just inserted the profiles row.
    // Repoint tenant_id at the user themselves — coaches sit at the root of
    // their own tenant — and ensure name/role are persisted server-side
    // (the trigger may not pick up user_metadata depending on its body).
    const { data: profile, error: updateErr } = await supabase
      .from('profiles')
      .update({ tenant_id: userId, name, role: 'admin' })
      .eq('id', userId)
      .select('id, name, email, role, tenant_id, active_program_id')
      .single();

    if (updateErr || !profile) {
      console.error('[admin-create-user] profile update failed', updateErr);
      return res.status(500).json({
        error: updateErr?.message ?? 'Auth user created but profile update failed.',
      });
    }

    return res.status(200).json({ profile });
  } catch (err) {
    console.error('[admin-create-user] unexpected failure', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return res.status(500).json({ error: message });
  }
}
