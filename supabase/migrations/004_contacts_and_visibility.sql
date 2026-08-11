-- ============================================================================
-- Adds phone numbers and the ability for a regular user to see who handled
-- earlier/later stages of an order they're working on (name + phone), for
-- handoff purposes -  without exposing the full user directory or passwords.
-- ============================================================================

alter table public.app_users add column if not exists phone text;

-- Safe, narrow lookup: any authenticated user can resolve a set of user ids to
-- just their name + phone (never username/password_plain/role). Runs as the
-- function owner, so it works regardless of the caller's own app_users RLS.
create or replace function public.get_user_contacts(p_user_ids uuid[])
returns table (id uuid, name text, phone text)
language sql
security definer
stable
as $$
  select id, name, phone from public.app_users where id = any(p_user_ids);
$$;

-- Previously a user could only read stage_entries for sections they were
-- personally assigned to, which silently hid other stages' completion status
-- from the order-progress calculation (breaking the "which stage is this
-- order currently at" gating for anyone not assigned to every stage). Anyone
-- with at least one assignment on an order can now read that whole order's
-- movement history (writing remains restricted to their own assigned
-- section -  only the read policy changes).
drop policy if exists "stage_entries_select" on public.stage_entries;
create policy "stage_entries_select" on public.stage_entries
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid() and ua.order_id = stage_entries.order_id
    )
  );

-- Same reasoning for assignments themselves: a user needs to see who ELSE is
-- assigned to other stages of an order they participate in, to know who to
-- hand off to next. Creating/editing assignments remains admin-only.
--
-- The "do I have another assignment on this order" check has to go through a
-- SECURITY DEFINER function rather than a plain subquery on user_assignments
-- itself -  a policy that queries its own table directly makes Postgres
-- re-evaluate that same policy for the subquery's rows, which re-runs the
-- subquery, forever ("infinite recursion detected in policy for relation
-- user_assignments", surfaced by PostgREST as a 500 on any query that touches
-- this table). The function's body runs as its owner and so bypasses RLS
-- instead of re-triggering it -  the same trick public.is_admin() already uses.
create or replace function public.has_order_assignment(p_order_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_assignments
    where user_id = auth.uid() and order_id = p_order_id
  );
$$;

drop policy if exists "user_assignments_select" on public.user_assignments;
create policy "user_assignments_select" on public.user_assignments
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or public.has_order_assignment(order_id)
  );
