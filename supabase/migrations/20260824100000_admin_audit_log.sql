-- ============================================================================
-- Admin audit log — immutable trail of tenant-admin user-management actions
-- ----------------------------------------------------------------------------
-- Records every mutating action performed via /admin/users:
--   - invite_member       : new user invited to the company
--   - update_role         : member role changed (member ↔ admin)
--   - toggle_active       : member activated or deactivated
--   - remove_member       : membership deleted
--
-- Why a dedicated table (vs. existing audit tables):
--   - mo_audit_logs   → financial/procurement (DB-trigger layer)
--   - erp_ai_audit_log → LLM call audit (tokens/cost/reasoning)
--   - dms_audit_log   → document management
-- None capture tenant identity-management, which is high-stakes for
-- compliance (who invited Lihtman's CFO? who promoted X to admin?).
--
-- Access model:
--   - INSERT/SELECT: service_role only (server actions use service-role).
--   - No UPDATE / DELETE permitted (immutable; even service_role goes through
--     INSERTs only).
-- ============================================================================

set search_path = public;

create table if not exists public.erp_admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null references public.erp_companies (id) on delete cascade,
  actor_user_id   uuid null references auth.users (id) on delete set null,
  actor_email     text null,
  action          text not null,
  target_user_id  uuid null references auth.users (id) on delete set null,
  target_email    text null,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint erp_admin_audit_log_action_chk
    check (action in ('invite_member', 'update_role', 'toggle_active', 'remove_member'))
);

comment on table public.erp_admin_audit_log is
  'Immutable audit log for tenant-admin actions in /admin/users. Insert-only.';
comment on column public.erp_admin_audit_log.action is
  'invite_member | update_role | toggle_active | remove_member';
comment on column public.erp_admin_audit_log.actor_email is
  'Snapshot of actor email at the time of the action (preserved if user is later deleted).';
comment on column public.erp_admin_audit_log.target_email is
  'Snapshot of target user email at the time of the action.';
comment on column public.erp_admin_audit_log.details is
  'Action-specific payload. Examples: { previous_role: "member", new_role: "admin" }, { is_active: false }, { invited: true }.';

create index if not exists erp_admin_audit_log_company_created_idx
  on public.erp_admin_audit_log (company_id, created_at desc);
create index if not exists erp_admin_audit_log_target_idx
  on public.erp_admin_audit_log (company_id, target_user_id, created_at desc);
create index if not exists erp_admin_audit_log_actor_idx
  on public.erp_admin_audit_log (company_id, actor_user_id, created_at desc);

alter table public.erp_admin_audit_log enable row level security;

-- service_role: full access (insert + read).
drop policy if exists erp_admin_audit_log_service_role_all on public.erp_admin_audit_log;
create policy erp_admin_audit_log_service_role_all
  on public.erp_admin_audit_log
  for all
  to service_role
  using (true)
  with check (true);

-- authenticated: NO direct access. All reads/writes go via server actions
-- (which use the service-role client). This ensures the admin-membership
-- check is always enforced in app code, never bypassed via RLS.
-- (Explicitly NO policies for `authenticated` role.)
