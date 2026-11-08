-- VOXEL Supabase schema and direct browser-storage access policies.
-- Run in Supabase Dashboard > SQL Editor. Re-runnable for a compatible mods table.
-- IMPORTANT: The admin code is embedded in the public browser app, so it is not a security boundary.
-- These anon write policies make direct browser writes possible and therefore permit any visitor
-- with the public key to write/delete rows and objects. Use Supabase Auth/server validation for real access control.

create extension if not exists pgcrypto;

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'Other',
  version text not null default '',
  author text not null default '',
  icon_url text,
  banner_url text,
  file_url text,
  file_path text,
  icon_path text,
  banner_path text,
  downloads bigint not null default 0 check (downloads >= 0),
  created_at timestamptz not null default now()
);

alter table public.mods add column if not exists description text not null default '';
alter table public.mods add column if not exists category text not null default 'Other';
alter table public.mods add column if not exists version text not null default '';
alter table public.mods add column if not exists author text not null default '';
alter table public.mods add column if not exists icon_url text;
alter table public.mods add column if not exists banner_url text;
alter table public.mods add column if not exists file_url text;
alter table public.mods add column if not exists file_path text;
alter table public.mods add column if not exists icon_path text;
alter table public.mods add column if not exists banner_path text;
alter table public.mods add column if not exists downloads bigint not null default 0;
alter table public.mods add column if not exists created_at timestamptz not null default now();

alter table public.mods enable row level security;
grant select, insert, update, delete on public.mods to anon, authenticated;
drop policy if exists "VOXEL mods are publicly readable" on public.mods;
create policy "VOXEL mods are publicly readable" on public.mods for select to anon, authenticated using (true);
drop policy if exists "VOXEL anon can insert mods" on public.mods;
create policy "VOXEL anon can insert mods" on public.mods for insert to anon, authenticated with check (true);
drop policy if exists "VOXEL anon can update mods" on public.mods;
create policy "VOXEL anon can update mods" on public.mods for update to anon, authenticated using (true) with check (true);
drop policy if exists "VOXEL anon can delete mods" on public.mods;
create policy "VOXEL anon can delete mods" on public.mods for delete to anon, authenticated using (true);

create or replace function public.increment_mod_downloads(p_mod_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_count bigint;
begin
  update public.mods
     set downloads = coalesce(downloads, 0) + 1
   where id::text = p_mod_id
   returning downloads into new_count;
  if new_count is null then raise exception 'Mod not found'; end if;
  return new_count;
end;
$$;
revoke all on function public.increment_mod_downloads(text) from public;
grant execute on function public.increment_mod_downloads(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mods', 'mods', true, 104857600, null)
on conflict (id) do update set public = true, file_size_limit = 104857600;

grant select, insert, update, delete on storage.objects to anon, authenticated;
drop policy if exists "VOXEL mods are publicly viewable" on storage.objects;
create policy "VOXEL mods are publicly viewable" on storage.objects for select to anon, authenticated using (bucket_id = 'mods');
drop policy if exists "VOXEL anon can upload mods" on storage.objects;
create policy "VOXEL anon can upload mods" on storage.objects for insert to anon, authenticated with check (bucket_id = 'mods');
drop policy if exists "VOXEL anon can update mods" on storage.objects;
create policy "VOXEL anon can update mods" on storage.objects for update to anon, authenticated using (bucket_id = 'mods') with check (bucket_id = 'mods');
drop policy if exists "VOXEL anon can delete mods" on storage.objects;
create policy "VOXEL anon can delete mods" on storage.objects for delete to anon, authenticated using (bucket_id = 'mods');
