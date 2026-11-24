-- =====================================================================
-- MS POS - SETUP (Supabase > SQL Editor > New query > paste > Run)
-- Yeh script PURANI restaurants/payments/pos_data/pay_settings tables saaf
-- karke nayi bana deti hai. Aap ka admin account (admins table) aur Supabase
-- ke Users delete NAHI hote. Dobara chalane se bhi koi masla nahi.
-- =====================================================================

drop table if exists pos_data cascade;
drop table if exists payments cascade;
drop table if exists restaurants cascade;
drop table if exists pay_settings cascade;

create table if not exists admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table restaurants(
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null, email text, phone text, address text, notes text,
  blocked boolean default false,
  plan_name text default 'monthly', plan_days int default 30,
  fee numeric default 0, is_free boolean default false,
  expires_at timestamptz, cloud_sync boolean default true,
  force_pay boolean default false, notice text, last_seen timestamptz,
  created_at timestamptz default now());
create table pay_settings(id int primary key default 1, data jsonb not null default '{}');
insert into pay_settings(id) values(1) on conflict do nothing;
create table payments(
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  restaurant_name text, method text, amount numeric, tid text, plan_days int,
  status text default 'pending', created_at timestamptz default now(), decided_at timestamptz);
create table pos_data(
  user_id uuid primary key references auth.users(id) on delete cascade,
  value jsonb not null, updated_at timestamptz default now());

create or replace function is_admin() returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from admins where user_id=auth.uid()) $$;
create or replace function is_active() returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from restaurants r where r.user_id=auth.uid() and not r.blocked and (r.is_free or r.expires_at>now())) $$;

alter table admins enable row level security;
alter table restaurants enable row level security;
alter table pay_settings enable row level security;
alter table payments enable row level security;
alter table pos_data enable row level security;

drop policy if exists a_self on admins; create policy a_self on admins for select to authenticated using (user_id=auth.uid());
create policy r_admin on restaurants for all to authenticated using (is_admin()) with check (is_admin());
create policy r_own on restaurants for select to authenticated using (user_id=auth.uid());
create policy s_read on pay_settings for select to authenticated using (true);
create policy s_admin on pay_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy p_admin on payments for all to authenticated using (is_admin()) with check (is_admin());
create policy p_own_r on payments for select to authenticated using (user_id=auth.uid());
create policy p_own_i on payments for insert to authenticated with check (user_id=auth.uid() and status='pending');
create policy d_admin on pos_data for all to authenticated using (is_admin()) with check (is_admin());
create policy d_own on pos_data for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and is_active());

-- ---------------------------------------------------------------------
-- ADMIN PANEL SE RESTAURANT BANANA / PASSWORD BADALNA / DELETE KARNA
-- (Supabase mein ja kar kuch banane ki zaroorat nahi, "Confirm email" ka masla bhi nahi)
-- ---------------------------------------------------------------------
create or replace function admin_create_restaurant(
  p_email text, p_password text, p_name text, p_phone text, p_plan_name text, p_plan_days int,
  p_fee numeric, p_is_free boolean, p_expires timestamptz, p_cloud boolean, p_notice text, p_notes text)
returns uuid language plpgsql security definer set search_path=public, extensions, auth as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  if not is_admin() then raise exception 'Sirf admin yeh kar sakta hai'; end if;
  if em is null or em = '' or length(coalesce(p_password,'')) < 6 then raise exception 'Email aur 6+ character password zaroori hai'; end if;
  select id into uid from auth.users where lower(email) = em;
  if uid is not null then
    if exists(select 1 from restaurants where user_id = uid) then raise exception 'Yeh email pehle se ek restaurant ko diya hua hai'; end if;
    if exists(select 1 from admins where user_id = uid) then raise exception 'Yeh email admin ka hai'; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
  else
    uid := gen_random_uuid();
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
    values('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',em,crypt(p_password,gen_salt('bf')),now(),
      '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','');
    insert into auth.identities(id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),uid,jsonb_build_object('sub',uid::text,'email',em,'email_verified',true),'email',uid::text,now(),now(),now());
  end if;
  insert into restaurants(user_id,name,email,phone,plan_name,plan_days,fee,is_free,expires_at,cloud_sync,notice,notes)
  values(uid,p_name,em,p_phone,p_plan_name,p_plan_days,p_fee,p_is_free,p_expires,p_cloud,p_notice,p_notes);
  return uid;
end $$;

create or replace function admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path=public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Sirf admin yeh kar sakta hai'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Password kam az kam 6 character'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

create or replace function admin_delete_restaurant(p_user uuid)
returns void language plpgsql security definer set search_path=public, auth as $$
begin
  if not is_admin() then raise exception 'Sirf admin yeh kar sakta hai'; end if;
  if exists(select 1 from admins where user_id = p_user) then raise exception 'Admin delete nahi ho sakta'; end if;
  delete from auth.users where id = p_user;  -- restaurant, payments aur online data bhi saath delete
end $$;

revoke all on function admin_create_restaurant(text,text,text,text,text,int,numeric,boolean,timestamptz,boolean,text,text) from public, anon;
revoke all on function admin_set_password(uuid,text) from public, anon;
revoke all on function admin_delete_restaurant(uuid) from public, anon;
grant execute on function admin_create_restaurant(text,text,text,text,text,int,numeric,boolean,timestamptz,boolean,text,text) to authenticated;
grant execute on function admin_set_password(uuid,text) to authenticated;
grant execute on function admin_delete_restaurant(uuid) to authenticated;


-- Restaurant ka "online / last seen" (POS har 30 sec mein ping karta hai)
create or replace function ping() returns void language sql security definer set search_path=public as
$$ update restaurants set last_seen = now() where user_id = auth.uid() $$;
revoke all on function ping() from public, anon;
grant execute on function ping() to authenticated;

-- ADMIN: aap ka admin email (agar pehle se hai to kuch nahi hoga)
insert into admins(user_id) select id from auth.users where email='scalesoft@gmail.com' on conflict do nothing;
