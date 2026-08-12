-- Lets an order-creator (app_users.can_create_orders, migration 016) delete
-- or hide an order they made themselves -  scoped the same way their update
-- permission already is, via created_by = auth.uid(), so this never extends
-- to Admin's or another creator's orders.
--
-- "Hide" is a soft, display-only toggle (orders.is_hidden), not a new access
-- boundary -  it's filtered out client-side wherever the fleet-wide order
-- list is shown (Dashboard, Admin Orders, Assign Work), while the creator's
-- own "Orders You've Created" list keeps showing it so they can unhide it.
-- No new RLS is needed to flip it: it's just another column on a row the
-- existing orders_update_order_creator policy already covers.
-- Idempotent: safe to run again.

alter table public.orders
  add column if not exists is_hidden boolean not null default false;

drop policy if exists "orders_delete_order_creator" on public.orders;
create policy "orders_delete_order_creator" on public.orders
  for delete using (public.can_create_orders() and created_by = auth.uid());
