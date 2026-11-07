-- Run in the Supabase SQL editor. Safe to re-run when upgrading an existing table.
create table if not exists public.photos (
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
  created_at timestamptz not null default now(),
  server_version bigint,
  server_updated_at timestamptz,
  deleted_at timestamptz
);

-- A monotonic cursor keeps incremental sync stable even when timestamps tie.
create sequence if not exists public.photos_server_version_seq;
alter table public.photos add column if not exists server_version bigint;
alter table public.photos add column if not exists server_updated_at timestamptz;
alter table public.photos add column if not exists deleted_at timestamptz;
alter table public.photos alter column server_version
  set default nextval('public.photos_server_version_seq'::regclass);
update public.photos
set server_version = nextval('public.photos_server_version_seq'::regclass),
    server_updated_at = coalesce(server_updated_at, updated_at, now())
where server_version is null or server_updated_at is null;
select setval(
  'public.photos_server_version_seq'::regclass,
  coalesce((select max(server_version) from public.photos), 0) + 1,
  false
);
alter table public.photos alter column server_version set not null;
-- The trigger assigns the sequence value after taking a transaction lock so
-- committed versions are visible in cursor order, even under concurrent writes.
alter table public.photos alter column server_version drop default;
alter table public.photos alter column server_updated_at set default now();
alter table public.photos alter column server_updated_at set not null;

-- Remove earlier global unique constraints; identity is scoped to its owner.
alter table public.photos drop constraint if exists photos_client_id_key;
alter table public.photos drop constraint if exists photos_client_id_unique;
alter table public.photos drop constraint if exists photos_storage_path_key;
alter table public.photos drop constraint if exists photos_storage_path_unique;
create unique index if not exists photos_user_client_id_key on public.photos (user_id, client_id);
create unique index if not exists photos_user_storage_path_key on public.photos (user_id, storage_path);
create unique index if not exists photos_server_version_key on public.photos (server_version);
create index if not exists photos_user_server_version_idx on public.photos (user_id, server_version);
create index if not exists photos_user_feed_idx on public.photos (user_id, id desc) where deleted_at is null;

create or replace function public.set_photo_server_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    -- A deliberate delete from the cloud feed wins regardless of device clock skew.
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
    new.deleted_at := new.updated_at;
  end if;

  if tg_op = 'UPDATE'
    and (new.updated_at < old.updated_at
      or (old.deleted_at is not null and new.updated_at <= old.updated_at)) then
    new.user_id := old.user_id;
    new.client_id := old.client_id;
    new.storage_path := old.storage_path;
    new.latitude := old.latitude;
    new.longitude := old.longitude;
    new.note := old.note;
    new.favorite := old.favorite;
    new.source := old.source;
    new.taken_at := old.taken_at;
    new.updated_at := old.updated_at;
    new.created_at := old.created_at;
    new.deleted_at := old.deleted_at;
  end if;

  new.server_version := nextval('public.photos_server_version_seq'::regclass);
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.lock_photo_server_metadata_cursor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock before row locks are taken. Sequence values then follow commit order,
  -- including multi-row writes, so incremental pulls cannot skip a transaction.
  perform pg_advisory_xact_lock(701042, 1);
  return null;
end;
$$;

drop trigger if exists photos_set_server_metadata on public.photos;
create trigger photos_set_server_metadata
before insert or update on public.photos
for each row execute function public.set_photo_server_metadata();
drop trigger if exists photos_lock_server_metadata_cursor on public.photos;
create trigger photos_lock_server_metadata_cursor
before insert or update on public.photos
for each statement execute function public.lock_photo_server_metadata_cursor();

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
