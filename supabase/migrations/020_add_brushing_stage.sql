-- ---------------------------------------------------------------------------
-- 020  Add the Brushing stage between Dyeing and Compacting.
--
-- Brushing raises the fleece on the back of the fabric. It is a round trip to
-- an outside unit exactly like Dyeing and Compacting -  fabric goes out, comes
-- back slightly lighter -  so it uses the same lot_send_receive form and
-- inherits the same wiring for free: the lot carry-forward, the send/receive
-- column split, the available-quantity ceiling and the override.
--
--     Knitting -> Dyeing -> BRUSHING -> Compacting -> In-House
--
-- The flow becomes 19 stages. Everything downstream of Dyeing shifts one place
-- along - no stage is removed, no row is deleted, and no section_id changes -
-- so every existing entry and transaction stays attached to its own stage.
--
-- Written as four plain statements with NO dollar-quoted DO block: the
-- Supabase SQL Editor splits a script on semicolons and mis-handles the ones
-- inside dollar-quoted ... dollar-quoted, which throws off every statement boundary after it.
--
-- IDEMPOTENT. Every statement is guarded on brushing does not exist yet or
-- is a no-op the second time, so running the file twice changes nothing.
--
-- Depends on: 018 (which renumbered the remaining stages contiguously).
-- ---------------------------------------------------------------------------


-- 1.  Park everything after Dyeing well clear of the live range.
--     sequence_no is UNIQUE, so a straight +1 on the tail would collide with
--     the row above it mid-update.
update public.workflow_stages
set sequence_no = sequence_no + 1000
where sequence_no > (select w.sequence_no from public.workflow_stages w where w.key = 'dyeing')
  and not exists (select 1 from public.workflow_stages b where b.key = 'brushing');


-- 2.  Bring the parked tail back, one place higher than it was.
--     A no-op on a second run, because nothing is above 1000 by then.
update public.workflow_stages
set sequence_no = sequence_no - 999
where sequence_no > 1000;


-- 3.  Insert Brushing into the gap this has just opened.
insert into public.workflow_stages (key, label, sequence_no, unit_type, typical_duration_days, form_type)
select 'brushing',
       'Brushing',
       (select w.sequence_no from public.workflow_stages w where w.key = 'dyeing') + 1,
       'KG',
       2,
       'lot_send_receive'
where exists (select 1 from public.workflow_stages d where d.key = 'dyeing')
  and not exists (select 1 from public.workflow_stages b where b.key = 'brushing');


-- ---------------------------------------------------------------------------
-- 4.  Verify.  Expect 19 rows, contiguous 1..19, Brushing at 7 between
--     Dyeing (6) and Compacting (8).
-- ---------------------------------------------------------------------------

select sequence_no, key, label, unit_type, form_type
from public.workflow_stages
order by sequence_no;

select
  count(*)                                           as stage_count,
  min(sequence_no)                                   as first_seq,
  max(sequence_no)                                   as last_seq,
  count(*) = max(sequence_no) - min(sequence_no) + 1 as contiguous,
  count(*) filter (where key = 'brushing')           as brushing_rows
from public.workflow_stages;
