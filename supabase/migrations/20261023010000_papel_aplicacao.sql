-- =============================================================================
-- Papel de aplicação `app_comissoes`
-- No Supabase o usuário `postgres` só pode ter a senha trocada pelo painel, e a
-- aplicação não deve usar superusuário. A Vercel e o importador conectam com um
-- papel próprio, criado ANTES desta migração (a senha nunca vai para o repo):
--
--   create role app_comissoes login password '<senha-forte>';
--
-- Esta migração é idempotente e só faz algo se o papel existir (em Postgres
-- local, onde a aplicação conecta com o dono do schema, ela é dispensada).
-- =============================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'app_comissoes') then
    raise notice 'Papel app_comissoes não existe; nada a fazer.';
    return;
  end if;

  grant usage on schema public to app_comissoes;
  grant all privileges on all tables    in schema public to app_comissoes;
  grant all privileges on all sequences in schema public to app_comissoes;
  grant execute        on all functions in schema public to app_comissoes;
  alter default privileges in schema public grant all on tables    to app_comissoes;
  alter default privileges in schema public grant all on sequences to app_comissoes;

  foreach t in array array['representada','cliente','pedido','pedido_item','nf_venda','nf_item',
                           'parcela','nfse_comissao','apuracao','parametro','auditoria']
  loop
    execute format('drop policy if exists %I on %I', t || '_app_total', t);
    execute format('create policy %I on %I for all to app_comissoes using (true) with check (true)',
                   t || '_app_total', t);
  end loop;
end $$;
