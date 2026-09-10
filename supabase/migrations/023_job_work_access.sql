-- ============================================================================
-- Job Work Access: lets a designated user log externally-manufactured
-- quantities against any order/section, kept in a separate ledger from the
-- in-house production_txns chain so the existing 19-stage workflow and its
-- calculations (src/lib/chain.ts) are never touched by this feature.
--
-- Modeled directly on Order Creator Access (migration 016) -  a boolean flag
-- on app_users, not a stage assignment, granted from Stage Roles. Blanket
-- access: any order, any of the 19 stages, no per-order assignment needed.
--
-- job_work_entries follows the same "append-only ledger, sum the rows"
-- convention as production_txns/material_entries/the rework side ledger:
-- nothing is ever overwritten, every figure is a sum of what's been entered.
-- Idempotent: safe to run again.
-- ============================================================================

alter table public.app_users
  add column if not exists can_job_work boolean not null default false;

create table if not exists public.job_work_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete set null,
  section_id uuid not null references public.workflow_stages(id) on delete cascade,
  -- 'total' -  one overall quantity for the section. 'size' -  broken down by
  -- size_code, one row per size. Mixing both modes for the same section is
  -- safe: the section total is always sum(qty) regardless of mode, and the
  -- size-wise breakdown is sum(qty) grouped by size_code among 'size' rows.
  mode text not null check (mode in ('size', 'total')),
  size_code text,
  unit text not null check (unit in ('KG', 'PCS')),
  qty numeric not null default 0,
  vendor_name text,
  doc_no text,
  entry_date date not null default current_date,
  notes text,
  entered_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_work_entries_order on public.job_work_entries (order_id);
create index if not exists idx_job_work_entries_section on public.job_work_entries (section_id);

create or replace function public.can_job_work()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and (u.role = 'admin' or u.can_job_work = true)
  );
$$;

alter table public.job_work_entries enable row level security;

-- Readable by anyone who can see the order at all -  same visibility as
-- production_txns, so Output & Reports can fold job-work numbers in for
-- every viewer (Admin, MD, assigned floor users), not just the job-work user.
drop policy if exists "job_work_entries_select" on public.job_work_entries;
create policy "job_work_entries_select" on public.job_work_entries
  for select using (public.can_view_order(order_id));

drop policy if exists "job_work_entries_insert" on public.job_work_entries;
create policy "job_work_entries_insert" on public.job_work_entries
  for insert with check (entered_by = auth.uid() and public.can_job_work());

-- Not scoped to entered_by = auth.uid() -  any job-work-permitted user may
-- correct any entry, the same convention production_txns_update already uses
-- for ordinary floor corrections.
drop policy if exists "job_work_entries_update" on public.job_work_entries;
create policy "job_work_entries_update" on public.job_work_entries
  for update using (public.can_job_work());

drop policy if exists "job_work_entries_delete_admin" on public.job_work_entries;
create policy "job_work_entries_delete_admin" on public.job_work_entries
  for delete using (public.is_admin());

drop trigger if exists trg_job_work_entries_touch on public.job_work_entries;
create trigger trg_job_work_entries_touch
before update on public.job_work_entries
for each row execute function public.touch_updated_at();
