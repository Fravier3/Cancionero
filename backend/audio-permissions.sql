-- Audio RPC runs as the server role. BYPASSRLS does not grant table privileges.
grant select on public.cancionero_songs to service_role;
grant update(audio_path,revision,updated_at) on public.cancionero_songs to service_role;
