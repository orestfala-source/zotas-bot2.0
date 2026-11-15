-- =====================================================================
--  ZONTAS VISUALS — логіни акаунтів сайту (реєстрація: пошта + логін + пароль)
--  Supabase → SQL Editor → встав і натисни Run (можна запускати повторно).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.zv_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  email      text,
  created_at timestamptz not null default now()
);
create unique index if not exists zv_profiles_username_idx on public.zv_profiles (lower(username));
alter table public.zv_profiles enable row level security;   -- напряму таблицю ніхто не читає

-- при реєстрації логін із форми записується в профіль; зайнятий логін — помилка
create or replace function public.zv_on_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u text := trim(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if u = '' then return new; end if;                 -- вхід без логіна (наприклад, створено вручну)
  if u !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'bad_username'; end if;
  if exists (select 1 from public.zv_profiles where lower(username) = lower(u)) then
    raise exception 'username_taken';
  end if;
  insert into public.zv_profiles (user_id, username, email) values (new.id, u, lower(new.email));
  return new;
end $$;
drop trigger if exists zv_on_new_user on auth.users;
create trigger zv_on_new_user after insert on auth.users for each row execute function public.zv_on_new_user();

-- чи вільний логін (для форми реєстрації)
create or replace function public.zv_login_available(p_login text)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.zv_profiles where lower(username) = lower(trim(p_login)));
$$;

-- вхід за логіном: пошта повертається ТІЛЬКИ якщо пароль правильний
create or replace function public.zv_login_email(p_login text, p_pass text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r text;
begin
  perform pg_sleep(0.3);  -- гальмуємо перебір паролів
  select u.email into r
    from public.zv_profiles p join auth.users u on u.id = p.user_id
   where lower(p.username) = lower(trim(p_login))
     and u.encrypted_password is not null
     and u.encrypted_password = extensions.crypt(p_pass, u.encrypted_password);
  return r;
end $$;

revoke all on function public.zv_login_available(text) from public;
revoke all on function public.zv_login_email(text, text) from public;
grant execute on function public.zv_login_available(text) to anon, authenticated;
grant execute on function public.zv_login_email(text, text) to anon, authenticated;
NOTIFY pgrst, 'reload schema';
