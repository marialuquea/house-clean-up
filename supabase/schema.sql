-- Clear-out app schema. Safe to re-run on a fresh or existing Supabase project.
-- Run in Supabase dashboard → SQL Editor → New query → paste → Run.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  mode text not null check (mode in ('fixed', 'offers', 'free')),
  asking_price int check (asking_price is null or asking_price > 0),
  original_price int check (original_price is null or original_price > 0),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'gone', 'hidden')),
  created_at timestamptz not null default now(),
  gone_at timestamptz,
  sort_order int not null default 0,
  constraint items_fixed_needs_price check (mode <> 'fixed' or asking_price > 0),
  constraint items_free_no_price check (mode <> 'free' or asking_price is null)
);

create table if not exists public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  path text not null,
  position int not null check (position between 0 and 4),
  unique (item_id, position)
);
create index if not exists item_photos_item_id_idx on public.item_photos(item_id);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  contact text not null check (char_length(contact) between 1 and 100),
  amount int check (amount is null or amount > 0),
  note text check (note is null or char_length(note) <= 300),
  pickup_dates date[] not null default '{}' check (cardinality(pickup_dates) <= 14),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'backup', 'declined')),
  final_amount int check (final_amount is null or final_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists requests_item_id_idx on public.requests(item_id);

-- For projects created from an earlier version of this file
alter table public.requests
  add column if not exists pickup_dates date[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Request validation trigger
--  * rejects requests on gone/hidden items
--  * amount: required >0 for offers, = asking price for fixed, null for free
--  * new requests on a reserved item land as 'backup'
--  * buyers can't set status, final_amount or created_at
-- ---------------------------------------------------------------------------
create or replace function public.requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.items%rowtype;
begin
  select * into it from public.items where id = new.item_id;
  if not found or it.status in ('gone', 'hidden') then
    raise exception 'This item is no longer available' using errcode = 'P0001';
  end if;

  if it.mode = 'offers' then
    if new.amount is null or new.amount <= 0 then
      raise exception 'An offer needs an amount' using errcode = 'P0001';
    end if;
  elsif it.mode = 'fixed' then
    if new.amount is distinct from it.asking_price then
      raise exception 'Amount must match the asking price' using errcode = 'P0001';
    end if;
  elsif it.mode = 'free' then
    if new.amount is not null then
      raise exception 'Free items take no amount' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(auth.role(), 'anon') <> 'authenticated' then
    new.final_amount := null;
    new.created_at := now();
    new.status := case when it.status = 'reserved' then 'backup' else 'pending' end;
  end if;

  return new;
end;
$$;

drop trigger if exists requests_before_insert on public.requests;
create trigger requests_before_insert
  before insert on public.requests
  for each row execute function public.requests_before_insert();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.requests enable row level security;

drop policy if exists items_public_read on public.items;
create policy items_public_read on public.items
  for select to anon using (status <> 'hidden');

drop policy if exists items_admin_all on public.items;
create policy items_admin_all on public.items
  for all to authenticated using (true) with check (true);

drop policy if exists item_photos_public_read on public.item_photos;
create policy item_photos_public_read on public.item_photos
  for select to anon using (
    exists (select 1 from public.items i where i.id = item_id and i.status <> 'hidden')
  );

drop policy if exists item_photos_admin_all on public.item_photos;
create policy item_photos_admin_all on public.item_photos
  for all to authenticated using (true) with check (true);

-- Buyers can only insert. No select/update/delete, so contacts stay admin-only.
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert on public.requests
  for insert to anon with check (true);

drop policy if exists requests_admin_all on public.requests;
create policy requests_admin_all on public.requests
  for all to authenticated using (true) with check (true);

revoke select, update, delete on public.requests from anon;
grant insert on public.requests to anon;

-- ---------------------------------------------------------------------------
-- Public stats: amounts and counts only, never names or contacts
-- ---------------------------------------------------------------------------
create or replace function public.public_item_stats(p_item_id uuid)
returns table (top_offer int, request_count int)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when i.mode = 'offers' then
      (select max(r.amount) from public.requests r
        where r.item_id = i.id and r.status <> 'declined')
    end as top_offer,
    (select count(*)::int from public.requests r
      where r.item_id = i.id and r.status <> 'declined') as request_count
  from public.items i
  where i.id = p_item_id and i.status <> 'hidden';
$$;

revoke all on function public.public_item_stats(uuid) from public;
grant execute on function public.public_item_stats(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin actions (atomic). Run as the caller, so RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.admin_accept_request(p_request_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  req public.requests%rowtype;
  it public.items%rowtype;
begin
  if coalesce(auth.role(), 'anon') <> 'authenticated' then
    raise exception 'Not allowed';
  end if;

  select * into req from public.requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into it from public.items where id = req.item_id for update;

  -- Anyone previously accepted drops back to the backup list
  update public.requests set status = 'backup'
    where item_id = req.item_id and status = 'accepted' and id <> req.id;

  update public.requests
    set status = 'accepted',
        final_amount = coalesce(final_amount, amount, it.asking_price, 0)
    where id = req.id;

  update public.requests set status = 'backup'
    where item_id = req.item_id and status = 'pending';

  update public.items set status = 'reserved', gone_at = null where id = req.item_id;
end;
$$;

create or replace function public.admin_fell_through(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'anon') <> 'authenticated' then
    raise exception 'Not allowed';
  end if;

  update public.requests set status = 'declined'
    where item_id = p_item_id and status = 'accepted';
  update public.requests set status = 'pending'
    where item_id = p_item_id and status = 'backup';
  update public.items set status = 'available', gone_at = null where id = p_item_id;
end;
$$;

revoke all on function public.admin_accept_request(uuid) from public, anon;
revoke all on function public.admin_fell_through(uuid) from public, anon;
grant execute on function public.admin_accept_request(uuid) to authenticated;
grant execute on function public.admin_fell_through(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket, admin-only writes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists photos_admin_insert on storage.objects;
create policy photos_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists photos_admin_update on storage.objects;
create policy photos_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'photos');

drop policy if exists photos_admin_delete on storage.objects;
create policy photos_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'photos');

-- ---------------------------------------------------------------------------
-- Retention: wipe buyer contact details 30 days after an item is Gone
-- ---------------------------------------------------------------------------
create or replace function public.wipe_old_contacts()
returns int
language sql
security definer
set search_path = public
as $$
  with wiped as (
    update public.requests r
       set name = '(removed)', contact = '(removed)', note = null
      from public.items i
     where r.item_id = i.id
       and i.status = 'gone'
       and i.gone_at < now() - interval '30 days'
       and r.contact <> '(removed)'
    returning r.id
  )
  select count(*)::int from wiped;
$$;

revoke all on function public.wipe_old_contacts() from public, anon, authenticated;

-- Daily at 03:15 UTC. Re-running replaces the existing job of the same name.
select cron.schedule(
  'wipe-old-contacts',
  '15 3 * * *',
  $$select public.wipe_old_contacts();$$
);
