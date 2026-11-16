-- O primeiro usuário vira ADM quando ainda não existe nenhum administrador.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
  nova_conta uuid;
begin
  select not exists(select 1 from perfis where papel = 'admin') into primeiro;
  insert into contas (nome) values (coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
    returning id into nova_conta;
  insert into perfis (id, email, nome, papel, aprovado, conta_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          case when primeiro then 'admin' else 'usuario' end,
          primeiro or coalesce((new.raw_app_meta_data->>'criado_pelo_admin')::boolean, false),
          nova_conta);
  insert into segredos_conta (conta_id) values (nova_conta);
  return new;
end $$;
