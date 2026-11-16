-- Login por usuário / telefone (além do e-mail)
alter table public.perfis add column if not exists usuario text;
alter table public.perfis add column if not exists telefone text;
create unique index if not exists perfis_usuario_unico on public.perfis (lower(usuario)) where usuario is not null;
create unique index if not exists perfis_telefone_unico on public.perfis (telefone) where telefone is not null;

create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
  nova_conta uuid;
begin
  select not exists(select 1 from perfis where papel = 'admin') into primeiro;
  insert into contas (nome) values (coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
    returning id into nova_conta;
  insert into perfis (id, email, nome, papel, aprovado, conta_id, usuario, telefone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          case when primeiro then 'admin' else 'usuario' end,
          primeiro or coalesce((new.raw_app_meta_data->>'criado_pelo_admin')::boolean, false),
          nova_conta,
          nullif(new.raw_user_meta_data->>'usuario',''),
          nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'telefone',''), '\D', '', 'g'),''));
  insert into segredos_conta (conta_id) values (nova_conta);
  return new;
end $$;

revoke execute on function public.existe_admin() from anon;
-- O usuário ADM foi criado diretamente no Supabase (usuário "Admin"); a senha não fica no código.
