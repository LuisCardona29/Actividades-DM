-- Run in the Supabase SQL editor. Safe to re-run when upgrading an existing table.
create table public.photos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  storage_path text not null,
  latitude double precision,
  longitude double precision,
  note text,
  favorite boolean not null default false,
  source text not null check (source in ('camera', 'gallery')),
  taken_at timestamptz not null,
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Remove earlier global unique constraints; identity is scoped to its owner.
alter table public.photos drop constraint if exists photos_client_id_key;
alter table public.photos drop constraint if exists photos_client_id_unique;
alter table public.photos drop constraint if exists photos_storage_path_key;
alter table public.photos drop constraint if exists photos_storage_path_unique;
create unique index if not exists photos_user_client_id_key on public.photos (user_id, client_id);
create unique index if not exists photos_user_storage_path_key on public.photos (user_id, storage_path);

alter table public.photos enable row level security;
alter table public.photos replica identity full;
grant select, insert, update, delete on public.photos to authenticated;
grant usage, select on sequence public.photos_id_seq to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.photos;
exception when duplicate_object then null;
end $$;

drop policy if exists "users read own photos" on public.photos;
drop policy if exists "ver las mias" on public.photos;
drop policy if exists "leer las mias" on public.photos;
create policy "users read own photos" on public.photos
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "users insert own photos" on public.photos;
drop policy if exists "crear las mias" on public.photos;
create policy "users insert own photos" on public.photos
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own photos" on public.photos;
drop policy if exists "borrar las mias" on public.photos;
create policy "users delete own photos" on public.photos
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "users update own photos" on public.photos;
create policy "users update own photos" on public.photos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('geocam', 'geocam', false)
on conflict (id) do update set public = false;

drop policy if exists "users upload to own GeoCam folder" on storage.objects;
drop policy if exists "subir a mi carpeta" on storage.objects;
create policy "users upload to own GeoCam folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'geocam'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users read own GeoCam folder" on storage.objects;
drop policy if exists "leer mi carpeta" on storage.objects;
create policy "users read own GeoCam folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'geocam'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users delete from own GeoCam folder" on storage.objects;
drop policy if exists "borrar de mi carpeta" on storage.objects;
create policy "users delete from own GeoCam folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'geocam'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users update own GeoCam folder" on storage.objects;
create policy "users update own GeoCam folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'geocam'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'geocam'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
