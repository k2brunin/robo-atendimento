-- =====================================================================
-- ROBÔ DE ATENDIMENTO - estrutura do banco de dados (Supabase/Postgres)
-- =====================================================================

-- ---------- CONTAS (1 conta = 1 WhatsApp) ----------
create table public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Minha conta',
  robo_ativo boolean not null default true,          -- liga/desliga o robô da conta
  whatsapp_status text not null default 'desconectado', -- desconectado | iniciando | aguardando_qr | conectado | erro
  whatsapp_qr text,                                   -- imagem do QR (data URL)
  whatsapp_numero text,
  whatsapp_nome text,
  comando text,                                       -- conectar | desconectar | reiniciar (lido pelo robô)
  comando_em timestamptz,
  robo_visto_em timestamptz,                          -- "batimento" do robô
  config jsonb not null default '{}'::jsonb,           -- horários, mensagens padrão, etc.
  ia_ativa boolean not null default false,             -- só o ADM altera
  ia_modo text not null default 'sugerir',             -- sugerir | responder
  criado_em timestamptz not null default now()
);

-- ---------- PERFIS (usuários do painel) ----------
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  papel text not null default 'usuario' check (papel in ('admin','usuario')),
  aprovado boolean not null default false,
  conta_id uuid references public.contas(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- ---------- SEGREDOS (chave da IA) - só ADM ----------
create table public.segredos_conta (
  conta_id uuid primary key references public.contas(id) on delete cascade,
  gemini_chave text,
  atualizado_em timestamptz not null default now()
);

-- ---------- FUNIS (um por produto/campanha) ----------
create table public.funis (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  palavras_chave text[] not null default '{}',
  prioridade int not null default 0,
  etapas jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.funis (conta_id);

-- ---------- CONTATOS / LEADS ----------
create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  wa_id text not null,                 -- id do chat no WhatsApp
  telefone text,
  nome text,                            -- nome editável no painel
  nome_whatsapp text,
  estado text not null default 'novo',  -- novo | identificando | no_funil | quente | humano | finalizado
  funil_id uuid references public.funis(id) on delete set null,
  etapa int not null default 0,
  aguardando text,                      -- tipo de resposta que o robô está esperando
  tentativas int not null default 0,    -- respostas não entendidas seguidas
  robo_pausado boolean not null default false,
  pausado_motivo text,
  pausado_em timestamptz,
  respostas jsonb not null default '{}'::jsonb,
  cep text, cidade text, uf text,
  motivo_humano text,
  sugestao_ia text,
  nao_lidas int not null default 0,
  ultima_msg text,
  ultima_msg_em timestamptz default now(),
  ultima_entrada_em timestamptz,
  quente_em timestamptz,
  atendido boolean not null default false,   -- marcado na fila como "já atendi"
  criado_em timestamptz not null default now(),
  unique (conta_id, wa_id)
);
create index on public.contatos (conta_id, ultima_msg_em desc);
create index on public.contatos (conta_id, estado);

-- ---------- MENSAGENS (histórico completo) ----------
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  direcao text not null check (direcao in ('entrada','saida')),
  autor text not null check (autor in ('cliente','robo','humano','painel','sistema')),
  tipo text not null default 'texto',   -- texto | imagem | audio | video | documento | figurinha | outro
  texto text,
  midia_path text,                      -- caminho no Storage
  wa_msg_id text,
  status text not null default 'ok',    -- ok | pendente | enviando | erro
  erro text,
  criado_em timestamptz not null default now()
);
create index on public.mensagens (contato_id, criado_em);
create index on public.mensagens (conta_id, status) where status = 'pendente';

-- =====================================================================
-- FUNÇÕES DE APOIO (segurança)
-- =====================================================================
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from perfis where id = auth.uid() and papel = 'admin' and aprovado);
$$;

create or replace function public.minha_conta() returns uuid
language sql stable security definer set search_path = public as $$
  select conta_id from perfis where id = auth.uid() and aprovado;
$$;

create or replace function public.pode_ver_conta(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or c = public.minha_conta();
$$;

-- Novo usuário criado no Auth => cria perfil. O PRIMEIRO vira ADM automaticamente.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
  nova_conta uuid;
begin
  select not exists(select 1 from perfis) into primeiro;
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

create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.novo_usuario();

-- Contato: atualiza resumo da última mensagem automaticamente
create or replace function public.atualiza_resumo_contato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update contatos set
    ultima_msg = coalesce(new.texto, '['||new.tipo||']'),
    ultima_msg_em = new.criado_em,
    nao_lidas = case when new.direcao = 'entrada' then nao_lidas + 1 else nao_lidas end,
    ultima_entrada_em = case when new.direcao = 'entrada' then new.criado_em else ultima_entrada_em end
  where id = new.contato_id;
  return new;
end $$;

create trigger ao_inserir_mensagem after insert on public.mensagens
for each row execute function public.atualiza_resumo_contato();

-- =====================================================================
-- SEGURANÇA POR LINHA (cada usuário só vê os próprios dados)
-- =====================================================================
alter table public.contas enable row level security;
alter table public.perfis enable row level security;
alter table public.segredos_conta enable row level security;
alter table public.funis enable row level security;
alter table public.contatos enable row level security;
alter table public.mensagens enable row level security;

create policy contas_ver on public.contas for select to authenticated using (public.pode_ver_conta(id));
create policy contas_editar on public.contas for update to authenticated using (public.pode_ver_conta(id)) with check (public.pode_ver_conta(id));
create policy contas_admin_del on public.contas for delete to authenticated using (public.eh_admin());

create policy perfis_ver on public.perfis for select to authenticated using (id = auth.uid() or public.eh_admin());
create policy perfis_admin on public.perfis for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy perfis_admin_del on public.perfis for delete to authenticated using (public.eh_admin());

create policy segredos_admin on public.segredos_conta for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy funis_tudo on public.funis for all to authenticated using (public.pode_ver_conta(conta_id)) with check (public.pode_ver_conta(conta_id));
create policy contatos_tudo on public.contatos for all to authenticated using (public.pode_ver_conta(conta_id)) with check (public.pode_ver_conta(conta_id));
create policy mensagens_tudo on public.mensagens for all to authenticated using (public.pode_ver_conta(conta_id)) with check (public.pode_ver_conta(conta_id));

-- Usuário comum não pode mudar campos exclusivos do ADM (IA)
create or replace function public.protege_campos_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() and auth.uid() is not null then
    new.ia_ativa := old.ia_ativa;
    new.ia_modo := old.ia_modo;
  end if;
  return new;
end $$;
create trigger protege_contas before update on public.contas
for each row execute function public.protege_campos_admin();

-- =====================================================================
-- TEMPO REAL (painel atualiza sozinho)
-- =====================================================================
alter publication supabase_realtime add table public.contas, public.contatos, public.mensagens;
alter table public.mensagens replica identity full;
alter table public.contatos replica identity full;

-- =====================================================================
-- ARQUIVOS (áudios, vídeos, banners, mídias recebidas)
-- Caminho sempre começa com o id da conta:  <conta_id>/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 52428800)
on conflict (id) do nothing;

create policy midias_ver on storage.objects for select to authenticated
  using (bucket_id = 'midias' and public.pode_ver_conta(((storage.foldername(name))[1])::uuid));
create policy midias_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'midias' and public.pode_ver_conta(((storage.foldername(name))[1])::uuid));
create policy midias_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'midias' and public.pode_ver_conta(((storage.foldername(name))[1])::uuid));
create policy midias_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'midias' and public.pode_ver_conta(((storage.foldername(name))[1])::uuid));
