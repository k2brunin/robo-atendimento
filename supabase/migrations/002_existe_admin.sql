-- Permite à tela de login saber se já existe um administrador (para mostrar "primeiro acesso").
create or replace function public.existe_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from perfis where papel = 'admin');
$$;
grant execute on function public.existe_admin() to anon, authenticated;
