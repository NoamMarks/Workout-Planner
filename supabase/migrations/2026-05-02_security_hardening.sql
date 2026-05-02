-- =============================================================================
-- Security hardening migration — 2026-05-02
-- =============================================================================
--
-- Apply this in the Supabase Dashboard → SQL Editor → New query, then click
-- Run. It is idempotent: every statement is `drop ... if exists` followed by
-- `create`, so re-running the script is safe.
--
-- WHAT THIS FIXES
--
--   1. RLS — programs_insert / programs_update / programs_delete now require
--      `current_role() = 'admin'` (or superadmin), not just `tenant_id` match.
--      The old policy let trainees author programs in their own tenant
--      because the only check was tenant equality. Caught by the RLS
--      pen-test suite (e2e/security-rls.spec.ts).
--
--   2. RPC — increment_invite_usage now references `public.invite_codes`
--      (the canonical table). Some prior deployment had it pointing at a
--      non-existent `public.invites` relation, which made every signup
--      consumption fail with `relation "public.invites" does not exist`.
--
-- After running this, the e2e/security-rls.spec.ts and the RPC checks in
-- e2e/security-api.spec.ts must come back 100% green.
-- =============================================================================

-- ── Programs RLS ─────────────────────────────────────────────────────────────

drop policy if exists "programs_insert" on public.programs;
create policy "programs_insert"
  on public.programs for insert to authenticated
  with check (
    (public.current_role() = 'admin' and tenant_id = public.current_tenant_id())
    or public.current_role() = 'superadmin'
  );

drop policy if exists "programs_update" on public.programs;
create policy "programs_update"
  on public.programs for update to authenticated
  using (
    (public.current_role() = 'admin' and tenant_id = public.current_tenant_id())
    or public.current_role() = 'superadmin'
  );

drop policy if exists "programs_delete" on public.programs;
create policy "programs_delete"
  on public.programs for delete to authenticated
  using (
    (public.current_role() = 'admin' and tenant_id = public.current_tenant_id())
    or public.current_role() = 'superadmin'
  );

-- ── increment_invite_usage RPC (correct table reference) ─────────────────────
--
-- DROP first because Postgres refuses to change a function's return type
-- via CREATE OR REPLACE. An older deployment of this function returned
-- `void`; we now want `boolean` so the caller can tell whether the row
-- actually matched. Using DROP FUNCTION IF EXISTS keeps the migration
-- idempotent for fresh projects too.
drop function if exists public.increment_invite_usage(text);

create function public.increment_invite_usage(invite_code text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  if invite_code is null or btrim(invite_code) = '' then
    return false;
  end if;
  update public.invite_codes
     set use_count = use_count + 1
   where code = upper(btrim(invite_code))
   returning id into updated_id;
  return updated_id is not null;
end;
$$;

grant execute on function public.increment_invite_usage(text) to authenticated, anon;

-- =============================================================================
-- Verification (paste into a new SQL Editor query AFTER running the above):
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'programs'
--      and policyname in ('programs_insert','programs_update','programs_delete');
--
--   -- Each row's `qual` / `with_check` should mention `current_role() = 'admin'`.
--
--   select pg_get_functiondef(oid)
--     from pg_proc
--    where proname = 'increment_invite_usage';
--
--   -- The body should contain `update public.invite_codes`.
-- =============================================================================
