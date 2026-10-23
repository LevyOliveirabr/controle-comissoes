-- =============================================================================
-- Controle de Comissões (Vice Versa) — schema inicial
-- Base: DDL do projeto.pdf (§6), ajustado pela análise funcional da planilha:
--   * nf_venda.numero é texto (planilha tem notas simuladas "SIM-0001")
--   * nfse_comissao.numero é texto e pode ser nulo (NFS-e Signify Jul/2026 sem
--     número; notas simuladas "SIM-C001"); unicidade por representada
--   * apuracao.nfse_id (vínculo direto) + parcela_id opcional (Signify/F-Led)
--   * pedido.entrega_prevista é texto livre ("Julho/2026", "29/07/2026")
--   * sem unique em apuracao (várias linhas por NF/mês acontecem na prática);
--     RN-27 é checada pela aplicação
-- Tudo que é fórmula na planilha (chaves, saldo, situação, Sel) é calculado no
-- motor TypeScript (src/lib/motor), nunca gravado.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type modo_controle      as enum ('completo', 'simplificado');
create type base_calculo       as enum ('valor_total_nf', 'valor_produtos');
create type regra_liberacao    as enum ('por_nf', 'por_parcela');
create type situacao_comercial as enum ('firme', 'previsao', 'convertido', 'cancelado');
create type origem_apuracao    as enum ('relatorio_representada', 'nfse_propria', 'manual');

-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------
create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tabelas de dado
-- ---------------------------------------------------------------------------
create table representada (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null unique,
  cnpj                 text unique,
  pct_padrao           numeric(9,6) not null check (pct_padrao between 0 and 1),
  base_calculo         base_calculo not null default 'valor_total_nf',
  po_comissao          text,
  dias_ate_apuracao    int not null default 0 check (dias_ate_apuracao >= 0),
  prazo_pagamento_dias int not null default 30 check (prazo_pagamento_dias >= 0),
  email_nf             text,
  email_copia          text,
  descricao_nf         text default 'Referente a Representacao Comercial',
  modo_controle        modo_controle not null default 'completo',
  envia_relatorio      boolean not null default true,   -- false = VW/Green (a NFS-e é a apuração)
  regra_liberacao      regra_liberacao not null default 'por_nf', -- por_parcela = F-Led
  padrao_nome_pedido   text,                             -- ex.: 'Pedido NN - Mês', 'PV NNN'
  cor                  text,
  ativa                boolean not null default true,
  observacoes          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

create table cliente (
  id              uuid primary key default gen_random_uuid(),
  representada_id uuid not null references representada(id),
  nome            text not null,
  cnpj            text,
  codigo_externo  text,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (representada_id, nome)
);

create table pedido (
  id                        uuid primary key default gen_random_uuid(),
  representada_id           uuid not null references representada(id),
  cliente_id                uuid not null references cliente(id),
  numero                    text not null,          -- 'Pedido 05 - Setembro', 'PV 668', 'OC 004323'
  referencia                text,                   -- proposta, doc. de venda, PO do cliente
  data_pedido               date,
  entrega_prevista          text,                   -- texto livre na planilha
  data_prevista_faturamento date,
  valor_total               numeric(14,2) not null check (valor_total >= 0),
  valor_original            numeric(14,2),          -- guardado quando ajustado pela NF (RN-04)
  pct_override              numeric(9,6) check (pct_override is null or pct_override between 0 and 1),
  situacao_comercial        situacao_comercial not null default 'firme',
  usa_itens                 boolean not null default false,
  observacoes               text,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),
  unique (representada_id, cliente_id, numero)
);

create table pedido_item (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedido(id) on delete cascade,
  item       int,
  familia    text not null,                          -- '65W', '100W', '140W' (matching por família)
  codigo     text,
  descricao  text,
  qtd        numeric(12,2) not null check (qtd >= 0),
  valor_unit numeric(14,4) not null check (valor_unit >= 0),
  criado_em  timestamptz not null default now()
);
create index pedido_item_pedido_idx on pedido_item(pedido_id);

create table nf_venda (
  id              uuid primary key default gen_random_uuid(),
  representada_id uuid not null references representada(id),
  cliente_id      uuid not null references cliente(id),
  pedido_id       uuid references pedido(id),       -- nulo no modo simplificado / venda direta
  numero          text not null,
  serie           text not null default '1',
  chave_acesso    char(44) unique,
  data_emissao    date not null,
  valor_produtos  numeric(14,2) not null check (valor_produtos >= 0),
  valor_total     numeric(14,2) not null check (valor_total >= 0),
  pct_override    numeric(9,6) check (pct_override is null or pct_override between 0 and 1),
  simulada        boolean not null default false,  -- notas SIM-... da Green
  venda_direta    boolean not null default false,  -- confirmação de NF sem pedido fora do modo simplificado
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (representada_id, numero, serie)
);
create index nf_venda_pedido_idx on nf_venda(pedido_id);
create index nf_venda_cliente_idx on nf_venda(cliente_id);

create table nf_item (
  id          uuid primary key default gen_random_uuid(),
  nf_venda_id uuid not null references nf_venda(id) on delete cascade,
  familia     text not null,
  codigo      text,
  qtd         numeric(12,2) not null check (qtd >= 0),
  valor_total numeric(14,2) not null check (valor_total >= 0),
  observacoes text,
  criado_em   timestamptz not null default now()
);
create index nf_item_nf_idx on nf_item(nf_venda_id);

create table parcela (
  id                   uuid primary key default gen_random_uuid(),
  nf_venda_id          uuid not null references nf_venda(id) on delete cascade,
  numero               int not null,
  vencimento_documento date not null,
  vencimento_boleto    date,
  valor                numeric(14,2) not null check (valor >= 0),
  cliente_pagou        boolean not null default false,
  data_pagamento       date,
  observacoes          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (nf_venda_id, numero)
);

create table nfse_comissao (
  id                      uuid primary key default gen_random_uuid(),
  representada_id         uuid not null references representada(id),
  numero                  text,                      -- pode ser nulo (ainda não numerada) ou 'SIM-C001'
  chave_acesso            text unique,
  data_emissao            date not null,
  competencia             date,                      -- 1º dia do mês de referência
  referencia              text,                      -- rótulo livre ('Set/2026', 'Out/2026 - NFs 877 e 884')
  valor                   numeric(14,2) not null check (valor >= 0),
  enviada_em              date,
  data_credito            date,
  data_credito_aproximada boolean not null default false,
  observacoes             text,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);
create unique index nfse_comissao_numero_uk on nfse_comissao(representada_id, numero) where numero is not null;

create table apuracao (
  id                     uuid primary key default gen_random_uuid(),
  representada_id        uuid not null references representada(id),
  nf_venda_id            uuid not null references nf_venda(id),
  parcela_id             uuid references parcela(id) on delete set null,
  nfse_id                uuid references nfse_comissao(id) on delete set null, -- vínculo direto (substitui a chave do mês)
  mes_referencia         date not null,              -- 1º dia do mês
  referencia             text,                       -- rótulo original ('Jul/2026', 'Green - parcela 1/4')
  data_pgto_representada date,
  nr_pgto                text,
  base                   numeric(14,2) not null check (base >= 0),
  pct                    numeric(9,6) not null check (pct between 0 and 1),
  valor_apurado          numeric(14,2) not null,
  origem                 origem_apuracao not null default 'relatorio_representada',
  observacoes            text,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index apuracao_nf_idx on apuracao(nf_venda_id);
create index apuracao_nfse_idx on apuracao(nfse_id);
create index apuracao_mes_idx on apuracao(representada_id, mes_referencia);

-- ---------------------------------------------------------------------------
-- Tabelas de apoio
-- ---------------------------------------------------------------------------
create table parametro (
  chave     text primary key,
  valor     numeric not null,
  descricao text
);

insert into parametro values
  ('tolerancia_saldo',    100,  'Saldo de pedido abaixo disso = faturado integralmente'),
  ('tolerancia_comissao', 0.05, 'Diferença de centavos entre previsto e apurado');

create table auditoria (
  id          bigserial primary key,
  tabela      text not null,
  registro_id uuid,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  usuario     text,
  em          timestamptz not null default now()
);
create index auditoria_registro_idx on auditoria(tabela, registro_id);
create index auditoria_em_idx on auditoria(em desc);

-- ---------------------------------------------------------------------------
-- Triggers: atualizado_em
-- ---------------------------------------------------------------------------
create trigger representada_atualizado  before update on representada  for each row execute function set_atualizado_em();
create trigger cliente_atualizado       before update on cliente       for each row execute function set_atualizado_em();
create trigger pedido_atualizado        before update on pedido        for each row execute function set_atualizado_em();
create trigger nf_venda_atualizado      before update on nf_venda      for each row execute function set_atualizado_em();
create trigger parcela_atualizado       before update on parcela       for each row execute function set_atualizado_em();
create trigger nfse_comissao_atualizado before update on nfse_comissao for each row execute function set_atualizado_em();
create trigger apuracao_atualizado      before update on apuracao      for each row execute function set_atualizado_em();

-- ---------------------------------------------------------------------------
-- Triggers: integridade entre representadas (PDF §6 "Restrições adicionais")
-- ---------------------------------------------------------------------------
create or replace function check_pedido_mesma_representada()
returns trigger language plpgsql as $$
declare rep uuid;
begin
  select representada_id into rep from cliente where id = new.cliente_id;
  if rep is distinct from new.representada_id then
    raise exception 'O cliente do pedido pertence a outra representada';
  end if;
  return new;
end $$;
create trigger pedido_mesma_representada before insert or update on pedido
  for each row execute function check_pedido_mesma_representada();

create or replace function check_nf_venda_integridade()
returns trigger language plpgsql as $$
declare rep uuid; modo modo_controle; ped_rep uuid; ped_cli uuid;
begin
  select representada_id into rep from cliente where id = new.cliente_id;
  if rep is distinct from new.representada_id then
    raise exception 'O cliente da NF pertence a outra representada';
  end if;
  if new.pedido_id is not null then
    select representada_id, cliente_id into ped_rep, ped_cli from pedido where id = new.pedido_id;
    if ped_rep is distinct from new.representada_id or ped_cli is distinct from new.cliente_id then
      raise exception 'O pedido da NF pertence a outra representada/cliente';
    end if;
  else
    select modo_controle into modo from representada where id = new.representada_id;
    if modo <> 'simplificado' and not new.venda_direta then
      raise exception 'NF sem pedido só é aceita em representada Simplificada ou com venda_direta = true';
    end if;
  end if;
  return new;
end $$;
create trigger nf_venda_integridade before insert or update on nf_venda
  for each row execute function check_nf_venda_integridade();

create or replace function check_apuracao_integridade()
returns trigger language plpgsql as $$
declare nf_rep uuid; nfse_rep uuid; parc_nf uuid;
begin
  select representada_id into nf_rep from nf_venda where id = new.nf_venda_id;
  if nf_rep is distinct from new.representada_id then
    raise exception 'A NF de venda da apuração pertence a outra representada';
  end if;
  if new.nfse_id is not null then
    select representada_id into nfse_rep from nfse_comissao where id = new.nfse_id;
    if nfse_rep is distinct from new.representada_id then
      raise exception 'A NFS-e da apuração pertence a outra representada';
    end if;
  end if;
  if new.parcela_id is not null then
    select nf_venda_id into parc_nf from parcela where id = new.parcela_id;
    if parc_nf is distinct from new.nf_venda_id then
      raise exception 'A parcela da apuração pertence a outra NF de venda';
    end if;
  end if;
  return new;
end $$;
create trigger apuracao_integridade before insert or update on apuracao
  for each row execute function check_apuracao_integridade();

-- ---------------------------------------------------------------------------
-- Trigger genérico de auditoria (RN-28)
-- O usuário é lido de current_setting('app.usuario') quando a aplicação o define.
-- ---------------------------------------------------------------------------
create or replace function registrar_auditoria()
returns trigger language plpgsql as $$
declare usuario_atual text := nullif(current_setting('app.usuario', true), '');
begin
  if tg_op = 'INSERT' then
    insert into auditoria(tabela, registro_id, acao, depois, usuario)
      values (tg_table_name, new.id, 'insert', to_jsonb(new), usuario_atual);
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) - 'atualizado_em' is distinct from to_jsonb(new) - 'atualizado_em' then
      insert into auditoria(tabela, registro_id, acao, antes, depois, usuario)
        values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), usuario_atual);
    end if;
    return new;
  else
    insert into auditoria(tabela, registro_id, acao, antes, usuario)
      values (tg_table_name, old.id, 'delete', to_jsonb(old), usuario_atual);
    return old;
  end if;
end $$;

create trigger representada_auditoria  after insert or update or delete on representada  for each row execute function registrar_auditoria();
create trigger cliente_auditoria       after insert or update or delete on cliente       for each row execute function registrar_auditoria();
create trigger pedido_auditoria        after insert or update or delete on pedido        for each row execute function registrar_auditoria();
create trigger pedido_item_auditoria   after insert or update or delete on pedido_item   for each row execute function registrar_auditoria();
create trigger nf_venda_auditoria      after insert or update or delete on nf_venda      for each row execute function registrar_auditoria();
create trigger nf_item_auditoria       after insert or update or delete on nf_item       for each row execute function registrar_auditoria();
create trigger parcela_auditoria       after insert or update or delete on parcela       for each row execute function registrar_auditoria();
create trigger nfse_comissao_auditoria after insert or update or delete on nfse_comissao for each row execute function registrar_auditoria();
create trigger apuracao_auditoria      after insert or update or delete on apuracao      for each row execute function registrar_auditoria();

-- ---------------------------------------------------------------------------
-- RLS: todas as tabelas expostas ficam protegidas. A aplicação acessa o banco
-- pelo servidor (DATABASE_URL); a Data API só responde a usuários autenticados.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['representada','cliente','pedido','pedido_item','nf_venda','nf_item',
                           'parcela','nfse_comissao','apuracao','parametro','auditoria']
  loop
    execute format('alter table %I enable row level security', t);
    -- O papel "authenticated" só existe no Supabase; em Postgres puro a política é dispensada.
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('create policy %I on %I for all to authenticated using (true) with check (true)',
                     t || '_autenticado_total', t);
    end if;
  end loop;
end $$;
