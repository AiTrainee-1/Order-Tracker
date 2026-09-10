-- ============================================================================
-- Rework side ledger: a fourth txn_type on the existing production_txns table.
--
-- Embroidery, Sewing, Checking, Ironing and Packing can now log pieces sent to
-- rework and pieces brought back out of it, per size, without any new table.
-- A 'rework' row reuses qty_in (pieces added to rework) and qty_out (pieces
-- solved) exactly like every other row -  it is written through the same
-- production_txns insert, the same RLS policies (can_enter_section already
-- covers it), the same audit log, and the same demo-mode store.
--
-- The one thing that makes this safe is that src/lib/chain.ts filters these
-- rows OUT before computing recordedIn/output/byLot/bySize -  a rework row can
-- never be mistaken for real production and inflate a stage's real numbers.
-- It is rolled up separately into ChainStage.reworkBySize instead, which
-- nothing else reads from.
-- ============================================================================

alter table public.production_txns drop constraint if exists production_txns_txn_type_check;
alter table public.production_txns add constraint production_txns_txn_type_check
  check (txn_type in ('process', 'send', 'receive', 'rework'));
