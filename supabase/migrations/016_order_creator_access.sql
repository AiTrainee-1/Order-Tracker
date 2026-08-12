-- Order Creator access: lets a floor user create new orders from their own
-- Home page, using the exact same order-creation form/procedure Admin uses.
-- Modeled as a boolean flag on app_users, not a stage assignment, since
-- creating an order isn't a production stage -  it happens before any stage
-- exists. Assigned from the Stage Roles page. Editing/deleting orders, and
-- every other admin-only write, stays admin-only and untouched.
-- Idempotent: safe to run again.

alter table public.orders
  add column if not exists created_by uuid references public.app_users(id) on delete set null;

alter table public.app_users
  add column if not exists can_create_orders boolean not null default false;

create or replace function public.can_create_orders()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and (u.role = 'admin' or u.can_create_orders = true)
  );
$$;

-- Insert-only grants. Postgres OR's multiple permissive policies together for
-- the same command, so these ADD to (never replace) the existing admin-only
-- "for all" policies -  update/delete on every one of these tables, and the
-- storage bucket's update/delete, remain admin-only exactly as before.
drop policy if exists "orders_insert_order_creator" on public.orders;
create policy "orders_insert_order_creator" on public.orders
  for insert with check (public.can_create_orders());

drop policy if exists "purchase_orders_insert_order_creator" on public.purchase_orders;
create policy "purchase_orders_insert_order_creator" on public.purchase_orders
  for insert with check (public.can_create_orders());

drop policy if exists "po_size_quantities_insert_order_creator" on public.po_size_quantities;
create policy "po_size_quantities_insert_order_creator" on public.po_size_quantities
  for insert with check (public.can_create_orders());

drop policy if exists "order_images_insert_order_creator" on storage.objects;
create policy "order_images_insert_order_creator" on storage.objects
  for insert with check (bucket_id = 'order-images' and public.can_create_orders());

-- Order creation writes the garment image as a follow-up UPDATE right after
-- the insert (see useCreateOrder), so the order-creator needs a matching
-- update allowance -  scoped to only the rows THEY created via created_by, so
-- this never extends to editing an admin's (or another order-creator's)
-- existing orders. RLS can't restrict which *columns* an update touches,
-- only which *rows*, so this is scoped as tightly as it can be at the row
-- level rather than left wide open.
drop policy if exists "orders_update_order_creator" on public.orders;
create policy "orders_update_order_creator" on public.orders
  for update using (public.can_create_orders() and created_by = auth.uid())
  with check (public.can_create_orders() and created_by = auth.uid());
