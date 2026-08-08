-- ============================================================================
-- Record that a stage was moved on, rather than inferring it from quantity.
--
-- Additive and non-destructive: one new column plus a backfill. Nothing is
-- deleted and no ids change, so it is safe to run against live data and safe
-- to re-run.
--
-- THE BUG THIS FIXES
--
-- "Not Complete – Move Forward" and "Save Plan" wrote identical rows whenever
-- the stage had no quantity to forward yet (is_completed = false,
-- qty_forwarded = 0). progress.ts inferred the partial state from the
-- quantity — `isPartial = !isCompleted && qtyForwarded > 0` — so a stage moved
-- on with nothing counted yet never went orange and never unlocked the stage
-- after it.
--
-- Raw Material Planning hit this every time: its forwarded figure is the yarn
-- and fabric actually RECEIVED, and planning happens before material arrives.
-- Pressing Move Forward looked like it did nothing, and Purchase Order to
-- Suppliers stayed locked.
--
-- Quantity was the wrong signal. Moving work on is a decision the operator
-- makes, so it is now stored as one. is_forwarded says "this stage was handed
-- on"; is_completed says "and it is finished". The three buttons map onto them
-- exactly:
--
--   Save Plan ..................... is_forwarded = false, is_completed = false
--   Not Complete – Move Forward ... is_forwarded = true,  is_completed = false
--   Completed – Move Forward ...... is_forwarded = true,  is_completed = true
-- ============================================================================

alter table public.stage_entries
  add column if not exists is_forwarded boolean not null default false;

-- Backfill. Every row written before this column existed came from a forward
-- action — Save Plan wrote nothing to stage_entries until the three-button
-- rework, and any row that moved quantity or closed a stage was a forward by
-- definition. Reconstruct that rather than leaving history looking unforwarded.
update public.stage_entries
set is_forwarded = true
where is_forwarded = false
  and (qty_forwarded > 0 or is_completed = true);

comment on column public.stage_entries.is_forwarded is
  'The operator moved this stage on. Independent of quantity: a stage can be '
  'forwarded with nothing counted yet (planning before material arrives), and '
  'the next stage still unlocks. Paired with is_completed, which additionally '
  'says the stage is finished.';
