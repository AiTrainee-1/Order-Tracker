-- ============================================================================
-- Reset production data. Keeps Orders and Users; clears everything recorded
-- against them.
--
-- ⚠ DESTRUCTIVE AND IRREVERSIBLE. Take a backup first
--   (Supabase → Database → Backups, or `pg_dump`).
--
-- Not a migration -  it lives outside supabase/migrations/ deliberately so it is
-- never picked up by a "run everything in order" pass. Run it by hand, when you
-- mean to.
--
-- KEPT
--   app_users            every user, password, role, phone
--   orders               every order
--   purchase_orders      their POs
--   po_size_quantities   the size breakdown of each PO
--   workflow_stages      the 20 stages -  reference data, NOT records.
--                        Deleting these breaks the whole app and can only be
--                        restored by re-running migrations 011 and 012.
--   storage order-images garment photos belong to the orders
--
-- REMOVED
--   every production entry, material plan, lot, transaction and audit row
-- ============================================================================

begin;

-- --- Quantity layer -------------------------------------------------------
-- material_entries has ON DELETE CASCADE from material_requirements, but it's
-- deleted explicitly so the row count below is honest.
delete from public.material_entries;
delete from public.material_requirements;
delete from public.production_txns;
delete from public.production_lots;

-- --- Gating layer ---------------------------------------------------------
delete from public.stage_entries;
delete from public.stage_sub_items;

-- --- History --------------------------------------------------------------
delete from public.audit_log;

-- --- Derived baselines ----------------------------------------------------
-- cut_quantity is set by Cutting. With the cutting entries gone it would be a
-- fixed post-cut figure for an order that has never been cut, and every PCS
-- stage would silently measure against it. Clear it with its source.
update public.orders          set cut_quantity = null where cut_quantity is not null;
update public.purchase_orders set cut_quantity = null where cut_quantity is not null;

-- --- JUDGEMENT CALL: assignments ------------------------------------------
-- Who is responsible for which stage. Config rather than production records,
-- so delete only if you want to reassign everyone from scratch. Until they're
-- recreated, non-admin users see an empty work list and cannot enter data.
-- Comment these two lines out to keep your current assignments.
delete from public.user_assignments;
delete from public.stage_assignments;

commit;

-- ---------------------------------------------------------------------------
-- Verify. workflow_stages must read 20; if it reads 0, migration 011 was never
-- applied and nothing else will work.
-- ---------------------------------------------------------------------------

select 'app_users' as table_name, count(*) from public.app_users
union all select 'orders',                count(*) from public.orders
union all select 'purchase_orders',       count(*) from public.purchase_orders
union all select 'po_size_quantities',    count(*) from public.po_size_quantities
union all select 'workflow_stages',       count(*) from public.workflow_stages
union all select 'user_assignments',      count(*) from public.user_assignments
union all select 'stage_assignments',     count(*) from public.stage_assignments
union all select 'stage_entries',         count(*) from public.stage_entries
union all select 'stage_sub_items',       count(*) from public.stage_sub_items
union all select 'production_lots',       count(*) from public.production_lots
union all select 'material_requirements', count(*) from public.material_requirements
union all select 'material_entries',      count(*) from public.material_entries
union all select 'production_txns',       count(*) from public.production_txns
union all select 'audit_log',             count(*) from public.audit_log
order by 1;
