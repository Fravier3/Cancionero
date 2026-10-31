-- The v2 editor requires a server-verified session, including for Misa.
revoke insert,update,delete on public.cancionero_masses from anon,authenticated;
revoke insert(date,entries),update(entries) on public.cancionero_masses from anon,authenticated;
drop policy if exists cancionero_collaborative_insert on public.cancionero_masses;
drop policy if exists cancionero_collaborative_update on public.cancionero_masses;
comment on table public.cancionero_masses is 'Cancionero v2: public read; writes only through session-verified cancionero_command.';
