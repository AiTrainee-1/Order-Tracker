-- ---------------------------------------------------------------------------
-- 021  Move lot creation from Knitting to Dyeing.
--
-- Yarn isn't a traceable batch yet -  it only becomes one once a specific
-- quantity of fabric is dispatched to be dyed. So the lot register now opens
-- at Dyeing instead of Knitting:
--
--     Knitting (total qty only) -> DYEING (creates the lot) -> Brushing -> ...
--
-- This migration changes ONLY who may INSERT a new row into production_lots.
-- Nothing else moves:
--   - Existing lots, and every txn that already references one, are
--     untouched -  a lot created at Knitting under the old rule stays exactly
--     as it is on whichever historical order created it.
--   - The application's own client-side gating (which stage's form shows a
--     lot picker, and whether that picker offers + New Lot) is a separate,
--     already-applied code change; this migration is the matching
--     server-side enforcement, the same way 018 enforced Knitting-only
--     creation for the rule this one replaces.
--
-- Plain statements only, no dollar-quoted block: DROP POLICY IF EXISTS then
-- CREATE POLICY needs no conditional logic, and is naturally idempotent on
-- its own -  running this file twice changes nothing the second time.
--
-- Depends on: 018 (created the policy this one replaces), 020 (Brushing,
-- unrelated but expected to already be applied by this point).
-- ---------------------------------------------------------------------------

drop policy if exists "production_lots_insert" on public.production_lots;
create policy "production_lots_insert" on public.production_lots
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      join public.workflow_stages ws on ws.id = ua.section_id
      where ua.user_id = auth.uid()
        and ua.order_id = production_lots.order_id
        and ua.can_enter_data = true
        and ws.key = 'dyeing'
    )
    or exists (
      select 1 from public.stage_assignments sa
      join public.workflow_stages ws on ws.id = sa.section_id
      where sa.user_id = auth.uid()
        and sa.can_enter_data = true
        and ws.key = 'dyeing'
    )
  );


-- ---------------------------------------------------------------------------
-- Verify.  Should show the new policy scoped to dyeing, not knitting.
-- ---------------------------------------------------------------------------

select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.production_lots'::regclass
  and polname = 'production_lots_insert';
