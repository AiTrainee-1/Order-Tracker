-- ============================================================================
-- Adds 'outside' to the allowed stage_entries.transfer_type values, alongside
-- the existing 'none' / 'branch' / 'unit'. Products can move to another branch,
-- another production unit, or to an outside party -  all three are tracked and
-- counted in the stage quantity calculations.
--
-- Additive only -  existing rows keep their current value.
-- ============================================================================

alter table public.stage_entries
  drop constraint if exists stage_entries_transfer_type_check;

alter table public.stage_entries
  add constraint stage_entries_transfer_type_check
  check (transfer_type in ('none', 'branch', 'unit', 'outside'));
