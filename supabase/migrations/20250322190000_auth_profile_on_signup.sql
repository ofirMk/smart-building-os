-- פרופיל אוטומטי לאחר הרשמה ב־Auth (מטא־דאטה: full_name, role לבחירת admin/tenant)
-- יש להריץ בפרויקט Supabase (כולל auth.users).

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'משתמש'),
    case
      when coalesce(new.raw_user_meta_data->>'role', '') = 'admin' then 'admin'::public.user_role
      else 'tenant'::public.user_role
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user ();
