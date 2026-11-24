-- UPDATE (agar pehle setup.sql chala chuke hain to SIRF yeh chalayein - koi data delete nahi hota)
alter table restaurants add column if not exists last_seen timestamptz;
create or replace function ping() returns void language sql security definer set search_path=public as
$$ update restaurants set last_seen = now() where user_id = auth.uid() $$;
revoke all on function ping() from public, anon;
grant execute on function ping() to authenticated;
