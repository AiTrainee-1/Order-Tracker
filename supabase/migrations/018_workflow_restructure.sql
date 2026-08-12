-- ============================================================================
-- Knitting → Cutting workflow restructure.
--
-- ⚠ THIS MIGRATION DELETES DATA. Setting and Raising are removed as real
-- production steps -  their workflow_stages rows are deleted, and any
-- stage_entries / production_txns already recorded against them go with them
-- (there is nowhere else for that data to live once the stage itself is gone).
-- Everything else -  orders, purchase_orders, lots, material data, and every
-- other stage's history -  is untouched.
--
-- WHAT CHANGES
--
-- 1. Setting and Raising are deleted from workflow_stages (and their
--    stage_entries/production_txns rows, first, to satisfy the FK). The
--    remaining 18 stages are renumbered contiguously by sequence_no.
--
-- 2. Knitting, Dyeing and Compacting move from a single "input → output"
--    ledger to a Sending/Receiving pair -  material physically leaves this
--    point to a processing unit, then comes back, and both are worth
--    recording separately (see src/components/forms/stage/chainForms.tsx,
--    LotSendReceiveForm, which is the same send/receive pattern Embroidery
--    already uses, generalized). Fabric In-House keeps the single-ledger
--    lot_process form_type it already had -  it wasn't part of this change.
--
-- 3. Lots may only be RAISED (inserted) by someone entering data at Knitting,
--    or an admin -  every later stage still picks from the existing register,
--    it just can't create a new one. This is the enforced half of that rule;
--    the UI half (hiding the "+ New Lot" affordance everywhere but Knitting)
--    lives in LotSelect's allowCreate prop.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove Setting and Raising
-- ---------------------------------------------------------------------------

delete from public.stage_entries
where section_id in (select id from public.workflow_stages where key in ('setting', 'raising'));

delete from public.production_txns
where section_id in (select id from public.workflow_stages where key in ('setting', 'raising'));

delete from public.stage_sub_items
where section_id in (select id from public.workflow_stages where key in ('setting', 'raising'));

delete from public.user_assignments
where section_id in (select id from public.workflow_stages where key in ('setting', 'raising'));

delete from public.stage_assignments
where section_id in (select id from public.workflow_stages where key in ('setting', 'raising'));

delete from public.workflow_stages where key in ('setting', 'raising');

-- Renumber the remaining 18 stages contiguously so sequence_no has no gaps.
with ordered as (
  select id, row_number() over (order by sequence_no) as rn
  from public.workflow_stages
)
update public.workflow_stages ws
set sequence_no = ordered.rn
from ordered
where ws.id = ordered.id;

-- ---------------------------------------------------------------------------
-- 2. Knitting / Dyeing / Compacting → Sending & Receiving
-- ---------------------------------------------------------------------------

update public.workflow_stages
set form_type = 'lot_send_receive'
where key in ('knitting', 'dyeing', 'compacting');

-- ---------------------------------------------------------------------------
-- 3. Lots may only be raised at Knitting
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
        and ws.key = 'knitting'
    )
    or exists (
      select 1 from public.stage_assignments sa
      join public.workflow_stages ws on ws.id = sa.section_id
      where sa.user_id = auth.uid()
        and sa.can_enter_data = true
        and ws.key = 'knitting'
    )
  );
