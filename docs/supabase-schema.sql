-- Intentionally public collaborative editing, explicitly requested by the app owner.
create function public.cancionero_valid_entries(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare entry jsonb;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 100 or octet_length(value::text) > 1000000 then return false; end if;
  for entry in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(entry) <> 'object'
      or jsonb_typeof(entry->'title') is distinct from 'string'
      or jsonb_typeof(entry->'lyrics') is distinct from 'string'
      or jsonb_typeof(entry->'category') is distinct from 'string'
      or length(trim(entry->>'title')) not between 1 and 200
      or length(entry->>'lyrics') not between 1 and 50000
      or length(entry->>'category') > 80 then return false; end if;
  end loop;
  return true;
end $$;
create table public.cancionero_masses (
  date date primary key check (extract(dow from date) = 0 and date between '2020-01-01' and '2100-12-31'),
  entries jsonb not null default '[]'::jsonb check (public.cancionero_valid_entries(entries)),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.cancionero_masses enable row level security;
create policy cancionero_public_read on public.cancionero_masses for select to anon, authenticated using (true);
create policy cancionero_collaborative_insert on public.cancionero_masses for insert to anon, authenticated with check (public.cancionero_valid_entries(entries));
create policy cancionero_collaborative_update on public.cancionero_masses for update to anon, authenticated using (date between '2020-01-01' and '2100-12-31') with check (public.cancionero_valid_entries(entries));
revoke all on public.cancionero_masses from anon, authenticated;
grant select on public.cancionero_masses to anon, authenticated;
grant insert (date, entries), update (entries) on public.cancionero_masses to anon, authenticated;
create function public.cancionero_mass_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.date := old.date; new.revision := old.revision + 1; new.updated_at := now();
  return new;
end $$;
create trigger cancionero_mass_revision before update on public.cancionero_masses
for each row execute function public.cancionero_mass_revision();
revoke all on function public.cancionero_mass_revision() from public;
comment on table public.cancionero_masses is 'Cancionero: public read and collaborative edit by explicit product decision. Column grants protect server revisions; no public DELETE.';
