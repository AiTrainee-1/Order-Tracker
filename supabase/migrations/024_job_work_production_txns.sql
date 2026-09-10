-- ============================================================================
-- Job Work Access v2: integrate into the real production ledger.
--
-- Migration 023 shipped Job Work as a genuinely separate table
-- (job_work_entries), blended into Output & Reports' final totals only. The
-- user has since said that isn't enough -  a Job Work entry needs to be a
-- REAL production entry: counted in that stage's actual output/balance, what
-- the next stage inherits as available, the per-order Dashboard, and Output
-- & Reports, everywhere chain.ts already reads production_txns.
--
-- The fix: production_txns already IS the one table every stage form writes
-- to, and chain.ts already sums qty_in/qty_out per section with zero
-- awareness of who entered a row or why. A Job Work entry doesn't need its
-- own ledger or its own calculation -  it needs to be the SAME kind of row,
-- with one new boolean purely for provenance/display, never read by any
-- chain.ts arithmetic.
--
-- Deliberately NOT in scope: stage_entries / gating. Job Work must never mark
-- a stage Forwarded/Complete or unlock the next assigned worker's stage -
-- that stays driven only by the assigned floor worker's own actions. See the
-- confirmed decision in the plan this migration implements.
-- ============================================================================

alter table public.production_txns
  add column if not exists is_job_work boolean not null default false;

-- Additional PERMISSIVE policies -  Postgres ORs these together with the
-- existing production_txns_insert/update from migration 011, so
-- can_enter_section() and every existing floor-worker permission is
-- completely untouched. A job-work user's elevated, assignment-free access
-- is bounded to rows they themselves tag is_job_work = true; they still
-- cannot touch a real in-house row through this policy.
drop policy if exists "production_txns_insert_job_work" on public.production_txns;
create policy "production_txns_insert_job_work" on public.production_txns
  for insert with check (
    entered_by = auth.uid()
    and public.can_job_work()
    and is_job_work = true
  );

drop policy if exists "production_txns_update_job_work" on public.production_txns;
create policy "production_txns_update_job_work" on public.production_txns
  for update using (
    public.can_job_work()
    and is_job_work = true
  );

-- ---------------------------------------------------------------------------
-- Migrate the existing job_work_entries rows into production_txns, then drop
-- the table. Round-trip stages (knitting/dyeing/brushing/compacting/
-- embroidery) record their real output on txn_type 'receive'; every other
-- stage records it on 'process' -  see chainForms.tsx's LedgerConfig per
-- stage, which this mirrors exactly.
-- ---------------------------------------------------------------------------

insert into public.production_txns (
  order_id, po_id, section_id, lot_id, size_code, txn_type, unit,
  qty_in, qty_out, qty_rejected, qty_rework,
  ref_name, doc_no, entry_date, notes, entered_by, is_job_work
)
select
  jwe.order_id,
  jwe.po_id,
  jwe.section_id,
  null,
  jwe.size_code,
  case
    when ws.key in ('knitting', 'dyeing', 'brushing', 'compacting', 'embroidery')
      then 'receive'
    else 'process'
  end,
  jwe.unit,
  0,
  jwe.qty,
  0,
  0,
  jwe.vendor_name,
  jwe.doc_no,
  jwe.entry_date,
  jwe.notes,
  jwe.entered_by,
  true
from public.job_work_entries jwe
join public.workflow_stages ws on ws.id = jwe.section_id;

drop table if exists public.job_work_entries;
