-- ============================================================================
-- Fix: stage_entries / stage_sub_items policies only recognized explicit
-- per-order user_assignments rows. Since migration 008, a user can also work
-- a stage via a global stage_assignments default (no user_assignments row at
-- all) — the app's work-list correctly showed those as "your turn" and let
-- the form render, but the database rejected the insert with 403 because the
-- RLS check never looked at stage_assignments. This adds that fallback to
-- every affected policy. Idempotent: safe to re-run.
-- ============================================================================

drop policy if exists "stage_entries_select" on public.stage_entries;
create policy "stage_entries_select" on public.stage_entries
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid() and ua.order_id = stage_entries.order_id
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_entries.section_id
    )
  );

drop policy if exists "stage_entries_insert" on public.stage_entries;
create policy "stage_entries_insert" on public.stage_entries
  for insert with check (
    entered_by = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.user_assignments ua
        where ua.user_id = auth.uid()
          and ua.order_id = stage_entries.order_id
          and ua.section_id = stage_entries.section_id
          and ua.can_enter_data = true
          and (ua.po_id is null or ua.po_id = stage_entries.po_id)
      )
      or exists (
        select 1 from public.stage_assignments sa
        where sa.user_id = auth.uid()
          and sa.section_id = stage_entries.section_id
          and sa.can_enter_data = true
      )
    )
  );

drop policy if exists "stage_sub_items_select" on public.stage_sub_items;
create policy "stage_sub_items_select" on public.stage_sub_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id
    )
  );

drop policy if exists "stage_sub_items_upsert" on public.stage_sub_items;
create policy "stage_sub_items_upsert" on public.stage_sub_items
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
        and ua.can_enter_data = true
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id and sa.can_enter_data = true
    )
  );

drop policy if exists "stage_sub_items_update" on public.stage_sub_items;
create policy "stage_sub_items_update" on public.stage_sub_items
  for update using (
    public.is_admin()
    or exists (
      select 1 from public.user_assignments ua
      where ua.user_id = auth.uid()
        and ua.order_id = stage_sub_items.order_id
        and ua.section_id = stage_sub_items.section_id
        and ua.can_enter_data = true
    )
    or exists (
      select 1 from public.stage_assignments sa
      where sa.user_id = auth.uid() and sa.section_id = stage_sub_items.section_id and sa.can_enter_data = true
    )
  );
