-- Run this once on an existing project that already applied supabase/schema.sql
-- (fresh installs get this column automatically since it's now in schema.sql too).
alter table public.stage_entries
  add column if not exists forwarded_to_user_id uuid references public.app_users(id);
