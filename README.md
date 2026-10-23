# Controle de Comissões — Vice Versa Representações

Sistema online que substitui a planilha `Controle_Representacoes.xlsx`: cadastro de representadas, clientes, pedidos, notas fiscais de venda, apurações de comissão e NFS-e, com dashboard (funil de 5 estágios, pipeline de previsão, matriz de 12 meses), agenda de recebimentos, consolidado por cliente e visão de faturamento.

Stack: **Next.js 16** (App Router, Server Actions) + **TypeScript** + **Tailwind 4**, banco **PostgreSQL** (Supabase em produção, migrações SQL em `supabase/migrations/`), deploy na **Vercel**. O motor de cálculo é uma biblioteca TypeScript pura (`src/lib/motor`) testada com **Vitest** contra os números da planilha original.

## Estrutura

```
supabase/migrations/      DDL (tabelas, enums, triggers de integridade, auditoria, RLS)
src/lib/motor/            Motor de cálculo puro (sem banco, sem relógio): calculo, funil, agenda, matriz, consolidado, faturamento
src/lib/importador/       Leitor da planilha original (ExcelJS)
src/lib/db.ts, dados.ts   Conexão Postgres e carga dos dados para o motor
src/lib/acoes/            Server Actions (validação com zod, transação, auditoria)
src/lib/acoes/servicos/   Serviços de negócio usados pelo bot: busca tolerante, pedidos, NFs, apuração, NFS-e, consultas
src/lib/mcp/              Servidor MCP (ferramentas em português, token Bearer) exposto em src/app/api/mcp/route.ts
src/proxy.ts              Basic Auth do site (APP_SENHA); /api/mcp fica fora dele
src/app/                  Telas: dashboard, agenda, consolidado, faturamento, pedidos, notas-fiscais, apuracoes, nfse, representadas, clientes, parametros, auditoria
scripts/                  db-migrate.ts, import-planilha.ts, gerar-fixture.ts
tests/                    Motor (fixture da planilha), serviços contra Postgres e MCP ponta a ponta por HTTP
```

## Rodando localmente

Pré-requisitos: Node 22+, um PostgreSQL acessível (local, Docker ou `supabase start`).

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL
npm run db:migrate            # aplica supabase/migrations/*.sql (controla em _migracoes)
npm run import:planilha -- caminho/Controle_Representacoes.xlsx --limpar   # opcional: carga da planilha + conferência
npm run dev                   # http://localhost:3000
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm test` | Vitest: motor, serviços e MCP. Os testes de banco só rodam se `DATABASE_URL_TESTE` apontar para um Postgres **descartável** (ex.: `postgresql://app:app@127.0.0.1:5432/comissoes_teste`); eles aplicam as migrações, apagam tudo e carregam a fixture a cada execução |
| `npm run typecheck` / `npm run lint` | TypeScript e ESLint |
| `npm run db:migrate -- --reset` | **Apaga** o schema `public` e reaplica tudo (só dev) |
| `npx tsx scripts/gerar-fixture.ts <planilha.xlsx>` | Regera `tests/fixtures/planilha.json` |

Postgres local sem Docker (Debian/Ubuntu): `sudo apt install postgresql`, depois `sudo -u postgres psql -c "create user app password 'app' superuser" -c "create database comissoes owner app"` e `DATABASE_URL=postgresql://app:app@127.0.0.1:5432/comissoes`.

## Supabase

1. Crie um projeto (região `sa-east-1`).
2. Migrações: `supabase link --project-ref <ref>` e `supabase db push`, **ou** `DATABASE_URL_DIRECT=<string de conexão direta, porta 5432> npm run db:migrate`.
3. No app use a string do **Transaction pooler** (porta 6543) em `DATABASE_URL`. A conexão já usa `prepare: false`, exigido pelo pooler.
4. RLS está ligado em todas as tabelas; a policy libera tudo para o role `authenticated` (criada só se o role existir). O MVP acessa o banco apenas pelo servidor (Server Actions / Server Components) — nada é exposto ao navegador.

## Deploy na Vercel

1. Importe o repositório na Vercel (framework Next.js, sem configuração extra).
2. Variáveis de ambiente: `DATABASE_URL` (pooler do Supabase) e, opcionalmente, `APP_USUARIO` (nome gravado na auditoria enquanto não há login).
3. Como o MVP ainda não tem autenticação, ative **Deployment Protection** (Vercel Authentication ou senha) no projeto até o login com Supabase Auth entrar.
4. Para o bot: `MCP_TOKEN` (ver "Conectar ao bot"). A rota `/api/mcp` não passa pelo Basic Auth do `src/proxy.ts`; ela só aceita esse token.

## Conectar ao bot

O sistema expõe um **servidor MCP remoto** (Streamable HTTP) em `https://<dominio>/api/mcp`. Qualquer assistente que fale MCP (Cursor, Grok, Claude, etc.) pode usá-lo: o Levy manda a frase em linguagem natural e o modelo chama as ferramentas, que gravam no banco com `usuario = "bot"` na auditoria.

### 1. Gerar o token e colocar na Vercel

```bash
openssl rand -hex 32        # ou: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Na Vercel: **Project → Settings → Environment Variables → Add** `MCP_TOKEN` = o valor gerado (Production e Preview), depois **Redeploy**. Sem a variável a rota responde `503` (desligada); com token errado, `401`. Para trocar o token basta gerar outro, atualizar a variável e o cliente.

### 2. Registrar o servidor no assistente

**Cursor** — `Settings → MCP → Add new global MCP server` (ou edite `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "comissoes": {
      "url": "https://<dominio>/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

**Grok / outros clientes com "Connectors" ou "Remote MCP"** — adicione um servidor remoto com a URL `https://<dominio>/api/mcp`, tipo *Streamable HTTP*, e o cabeçalho `Authorization: Bearer <MCP_TOKEN>`. Se o cliente só tiver campo de "API key"/token Bearer, cole o `MCP_TOKEN` nele.

Teste rápido no terminal (deve listar as 14 ferramentas):

```bash
curl -s https://<dominio>/api/mcp -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 3. Frases que funcionam

| Frase | Ferramenta |
| --- | --- |
| "Tirei um pedido da Signify pra Remo, 85 mil, entrega em dezembro" | `criar_pedido` |
| "A previsão da Signify pra Remo virou pedido firme" | `atualizar_pedido` |
| "Chegou a NF 925 da VW pra Luz Forte, R$ 10.288,03, 3 parcelas" | `lancar_nf` |
| "O Alegrete pagou a primeira parcela da NF 1234" | `registrar_parcela_paga` |
| "A F-Led apurou a parcela 1 da NF 1234 no relatório de dezembro" | `registrar_apuracao` |
| "Emiti a NFS-e 12 pra F-Led hoje" | `emitir_nfse` |
| "Recebi a comissão da Signify de outubro, caiu hoje" | `registrar_credito_nfse` |
| "Como estão as comissões?" / "Quanto tenho a receber da Signify?" | `consultar_resumo` |
| "O que está atrasado?" / "O que vou receber nos próximos 3 meses?" | `consultar_pendencias` |
| "Quais pedidos da Signify ainda não foram faturados?" | `listar_pedidos_em_aberto` |
| "O que a VW ainda não apurou?" | `listar_nfs_sem_apuracao` |
| "Cadastra o cliente Ferragens Zé na Maxi" | `criar_cliente` / `buscar_cliente` / `buscar_representada` |

Nomes aproximados são aceitos ("Signfy", "Remo", "VW", "Luz Forte"). Quando houver mais de uma opção possível (dois pedidos em aberto do mesmo cliente, dois clientes com "Participações" no nome), a ferramenta devolve as opções e o assistente pergunta em vez de chutar. Datas omitidas valem "hoje" (fuso de Brasília).

### Ferramentas MCP

`buscar_representada`, `buscar_cliente`, `criar_cliente`, `criar_pedido`, `atualizar_pedido`, `lancar_nf`, `registrar_parcela_paga`, `registrar_apuracao`, `emitir_nfse`, `registrar_credito_nfse`, `consultar_resumo`, `consultar_pendencias`, `listar_pedidos_em_aberto`, `listar_nfs_sem_apuracao`. Cada uma devolve uma `mensagem` legível + o objeto completo em `structuredContent`; erros de validação/negócio voltam com `isError` e explicação em português.

Rodando local: `MCP_TOKEN=qualquer-coisa npm run dev` e aponte o cliente para `http://localhost:3000/api/mcp`.

## Importação da planilha e conferência

`npm run import:planilha -- <arquivo.xlsx> [--limpar] [--hoje=AAAA-MM-DD]` lê as abas de entrada manual (Representadas, Clientes, Pedidos, Itens do Pedido, Notas Fiscais, Itens Faturados, Parcelas, NF Comissao, Relatorios Comissao, Parametros), grava no banco e recalcula tudo pelo motor comparando com os totais da aba Dashboard. Resultado com a planilha original (calculada em 22/10/2026):

| Indicador | Planilha | Sistema |
| --- | ---: | ---: |
| Comissão já recebida | R$ 167.018,64 | R$ 167.018,64 |
| A receber firme — card do Dashboard (estágio 4 residual) | R$ 104.251,89 | R$ 104.251,89 |
| A receber firme — matriz 12 meses (nota a nota) | R$ 104.363,29 | R$ 104.363,29 |
| Em previsão | R$ 45.468,00 | R$ 45.468,00 |
| Funil 1 / 2 / 3 / 4 (residual) / 5 | 167.018,64 / 58.731,25 / 0 / 25.852,36 / 19.668,28 | iguais |
| Matriz — Vencido | R$ 33.355,68 | R$ 33.355,68 |

**Diferença explicada (Green, R$ 111,44).** O pedido da Green tem 2,29% digitado por cima da fórmula do "% efetivo" (coluna J da aba Pedidos), então a comissão prevista é R$ 49.168,56; já as NFS-e lançadas somam R$ 49.280,00 (R$ 15.924,32 a 2,9667% + R$ 33.355,68 a 2,29%). O card da planilha calcula o estágio 4 como resíduo (Σ previsto − Σ apurado), e esse resíduo absorve os R$ 111,44; a matriz da planilha soma nota a nota e por isso mostra R$ 104.363,29. O sistema calcula **nota a nota** (RN-16): o card mostra R$ 104.363,29 e a divergência aparece como alerta no Dashboard e na NF. O valor residual continua disponível em `funil.a_receber_firme_planilha` só para conferência. Veja "Premissas" abaixo.

## Regras de negócio implementadas (resumo)

- Percentual: NF manual → pedido → padrão da representada (RN-07). Base: valor total da NF ou valor dos produtos, por representada.
- Pedidos: Firme / Previsão / Convertido / Cancelado; saldo a faturar por itens (família × quantidade) quando controlado por item, senão valor − faturado; tolerância de R$ 100 para "Faturado integralmente"; ajuste do valor do pedido ao da NF guardando o original (RN-04).
- NF de venda: comissão prevista/apurada/recebida, saldo com tolerância de R$ 0,05, status em 4 passos (não apurada → apurada aguardando NFS-e → NFS-e emitida → recebida), conferência dos itens, parcelas/duplicatas. NF sem pedido só em representada simplificada ou marcada como venda direta (trigger).
- Apuração: por NF ou por parcela (Signify); vínculo direto com a NFS-e; situação derivada da NFS-e (sem NFS-e → aguardando pagamento → recebida).
- NFS-e: previsão de crédito = emissão + prazo da representada; checklist PO / descrição / e-mail; apurações cobertas; alerta quando o valor não bate com as apurações; registro do crédito.
- Agenda (4 origens) e matriz de 12 meses: NFS-e emitida → previsão de crédito; NF sem apuração → emissão + dias até apuração + prazo; apuração sem NFS-e → hoje + prazo; pedido firme → data prevista de faturamento + ciclo. Representada "por parcela" (F-Led): uma comissão por parcela no mês seguinte ao vencimento.
- Filtro global por representada e cliente em todas as visões; auditoria de todas as alterações (trigger no banco).

## Premissas assumidas a partir da planilha

1. **Green 2,29%** foi tratado como override do pedido (o valor estava digitado sobre a fórmula do % efetivo). O % padrão da representada (2,9667%) foi deduzido pela própria planilha de R$ 63.697,26 / R$ 2.147.098,80 — a confirmar com a Green se a comissão é percentual ou valor fixo.
2. **"Não envia relatório"** (VW e Green) foi inferido das observações; nessas representadas a própria NFS-e é a apuração (`origem = nfse_propria`).
3. **F-Led "por parcela"** inferido da observação "liberação no mês subsequente ao vencimento". Enquanto não há NF, o pedido entra na agenda pela regra geral (faturamento previsto + 30 + 60 → 26/01/2027).
4. **Apuração × parcela** (Signify): o vínculo foi feito pelo valor da base igual ao valor da parcela, já que a planilha não guarda esse vínculo.
5. **Apuração × NFS-e**: na planilha o vínculo é pelo rótulo "Representada|Mês"; no sistema virou chave estrangeira direta (`apuracao.nfse_id`).
6. **Dias até apuração = 0** em VW, Green e Maxi (como na planilha): a comissão é esperada emissão + prazo de pagamento.
7. Sem login no MVP (próxima fase: Supabase Auth); use Deployment Protection na Vercel.
