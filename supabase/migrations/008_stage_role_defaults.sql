-- ============================================================================
-- Global stage-role defaults: assign a user to a production stage once, and
-- they become the default assignee for that stage across EVERY order (existing
-- and future) — instead of scoping them order-by-order in user_assignments.
--
-- The app treats a row here as an implicit assignment on every order for that
-- section. Explicit per-order rows in user_assignments still take precedence /
-- add finer (per-PO) scope on top of these defaults.
-- ============================================================================

create table if not exists public.stage_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  section_id uuid not null references public.workflow_stages(id) on delete cascade,
  can_enter_data boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, section_id)
);

create index if not exists idx_stage_assignments_section on public.stage_assignments (section_id);
create index if not exists idx_stage_assignments_user on public.stage_assignments (user_id);

alter table public.stage_assignments enable row level security;

-- Readable by any signed-in user: a user needs their own defaults to build their
-- work list, and everyone needs to see who's on a stage for handoff contacts.
-- (Only user_id + section_id + can_enter_data — no sensitive fields.)
create policy "stage_assignments_select" on public.stage_assignments
  for select using (auth.role() = 'authenticated');

-- Only admins create/change/remove the global defaults.
create policy "stage_assignments_write_admin" on public.stage_assignments
  for all using (public.is_admin()) with check (public.is_admin());
