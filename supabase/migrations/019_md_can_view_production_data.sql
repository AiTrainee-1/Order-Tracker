-- ============================================================================
-- MD can read the production/quantity layer.
--
-- THE GAP THIS CLOSES
--
-- Migration 015 gave the MD role read access to exactly three tables -
-- app_users, user_assignments and stage_entries. That is enough to render the
-- Dashboard's stage colours (which come from the gating layer), and it is why
-- the MD view has looked "almost right": stages show as completed or pending,
-- but every quantity beside them reads zero.
--
-- The reason is that the whole quantity layer -  production_txns,
-- production_lots, material_requirements, material_entries and audit_log -
-- gates its SELECT on can_view_order(), and that helper predates the MD role:
--
--     is_admin()                          -> false for MD
--     a user_assignments row on the order -> MD is assigned to no orders
--     any stage_assignments row           -> MD holds no stage roles
--
-- so it returns false for MD on every order, and every one of those tables
-- returns an empty set. Order Tracking, the Workflow Map and the per-section
-- activity view are all built on that data, so for MD they render structurally
-- correct and numerically empty.
--
-- WHAT CHANGES
--
-- One line: can_view_order() now short-circuits on is_admin_or_md() instead of
-- is_admin(). Because every affected policy already calls this helper, the
-- single change fixes all five tables at once and nothing else has to move.
--
-- This widens READ ONLY. MD has no write policy on any of these tables -
-- inserts and updates go through can_enter_section() / can_enter_materials() /
-- is_admin(), none of which are touched here -  so MD remains a read-only
-- login exactly as designed in 015.
-- ============================================================================

create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin_or_md()
     or exists (
       select 1 from public.user_assignments ua
       where ua.user_id = auth.uid() and ua.order_id = p_order_id
     )
     or exists (
       select 1 from public.stage_assignments sa where sa.user_id = auth.uid()
     );
$$;
