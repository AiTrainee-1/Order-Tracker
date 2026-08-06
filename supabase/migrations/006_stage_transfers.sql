-- ============================================================================
-- Per-entry transfer capture: records whether a stage's movement went to
-- another branch or another production unit/vendor, and where. Surfaced on the
-- admin dashboard (order detail entry tables + stage tooltip).
--
-- transfer_type: 'none'   — internal, no transfer (default)
--                'branch' — moved to another company branch
--                'unit'   — moved to another production unit / subcontractor
-- transfer_to:   free-text destination name (branch/unit), null when 'none'.
--
-- Additive only — no data loss, existing rows default to 'none'. The existing
-- stage_entries RLS policies already cover these columns (row-level, not
-- column-level), so no policy changes are needed.
-- ============================================================================

alter table public.stage_entries
  add column if not exists transfer_type text not null default 'none';

alter table public.stage_entries
  add column if not exists transfer_to text;

-- Guard the allowed values. Dropped-then-added so re-running the migration is safe.
alter table public.stage_entries
  drop constraint if exists stage_entries_transfer_type_check;

alter table public.stage_entries
  add constraint stage_entries_transfer_type_check
  check (transfer_type in ('none', 'branch', 'unit'));
