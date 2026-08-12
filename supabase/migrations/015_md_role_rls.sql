-- MD (Managing Director) role: a read-only login that sees a fleet-wide
-- Dashboard and a simplified Users list, nothing else. Adds a second helper
-- alongside is_admin() and widens exactly the three SELECT policies that
-- view needs (app_users, user_assignments, stage_entries) -  every write
-- policy, and every other table's policy, stays admin-only and untouched.
-- Idempotent: safe to run again.

create or replace function public.is_admin_or_md()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.role in ('admin', 'md')
  );
$$;

drop policy if exists "app_users_select" on public.app_users;
create policy "app_users_select" on public.app_users
  for select using (auth.uid() = id or public.is_admin_or_md());

drop policy if exists "user_assignments_select" on public.user_assignments;
create policy "user_assignments_select" on public.user_assignments
  for select using (
    public.is_admin_or_md()
    or user_id = auth.uid()
    or public.has_order_assignment(order_id)
  );

drop policy if exists "stage_entries_select" on public.stage_entries;
create policy "stage_entries_select" on public.stage_entries
  for select using (
    public.is_admin_or_md()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid() and ua.order_id = stage_entries.order_id
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_entries.section_id
    )
  );
