/**
 * Importa a planilha Controle_Representacoes.xlsx para o banco e confere os
 * totais com o que a própria planilha calculou (aba Dashboard).
 *
 * Uso: npm run import:planilha -- <arquivo.xlsx> [--limpar] [--hoje=AAAA-MM-DD]
 *   --limpar  apaga todos os dados antes de importar (apenas dev!)
 *   --hoje    data de referência para a conferência (padrão: data em que a
 *             planilha foi calculada, 2026-10-22)
 */
import "dotenv/config";
import { criarConexao } from "../src/lib/db";
import { lerPlanilha } from "../src/lib/importador/ler-planilha";
import { calcular } from "../src/lib/motor";
import type { Dados } from "../src/lib/motor/tipos";

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--"));
const limpar = args.includes("--limpar");
const hoje = args.find((a) => a.startsWith("--hoje="))?.slice(7) ?? "2026-10-22";

if (!arquivo) {
  console.error("Uso: npm run import:planilha -- <arquivo.xlsx> [--limpar]");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL no .env");
  process.exit(1);
}

const brl = (v: number | null | undefined) =>
  v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TABELAS = ["apuracao", "nfse_comissao", "parcela", "nf_item", "nf_venda", "pedido_item", "pedido", "cliente", "representada"];

async function main() {
  const lida = await lerPlanilha(arquivo!);
  const d = lida.dados;
  console.log(`Planilha lida: ${d.representadas.length} representadas, ${d.clientes.length} clientes, ${d.pedidos.length} pedidos, ${d.nfs.length} NFs, ${d.parcelas.length} parcelas, ${d.apuracoes.length} apurações, ${d.nfses.length} NFS-e`);
  for (const a of lida.avisos) console.log(`  aviso: ${a}`);

  const sql = criarConexao(url!);
  const ids = new Map<string, string>(); // id da planilha → uuid
  const uuid = (id: string | null) => {
    if (id == null) return null;
    const u = ids.get(id);
    if (!u) throw new Error(`Referência não importada: ${id}`);
    return u;
  };

  await sql.begin(async (tx) => {
    await tx`select set_config('app.usuario', 'import:planilha', true)`;
    if (limpar) {
      console.log("Limpando tabelas...");
      for (const t of TABELAS) await tx.unsafe(`delete from ${t}`);
    } else {
      const [{ n }] = await tx`select count(*)::int as n from representada`;
      if (n > 0) throw new Error("Banco já tem dados. Use --limpar para substituir (apaga tudo).");
    }

    const inserir = async (tabela: string, registros: object[], colunas: string[]) => {
      for (const r of registros) {
        const obj = r as Record<string, unknown>;
        const linha = Object.fromEntries(colunas.map((c) => [c, obj[c] ?? null]));
        const [{ id }] = await tx`insert into ${tx(tabela)} ${tx(linha)} returning id`;
        ids.set(obj.id as string, id as string);
      }
    };

    await inserir("representada", d.representadas, [
      "nome", "cnpj", "pct_padrao", "base_calculo", "po_comissao", "dias_ate_apuracao", "prazo_pagamento_dias",
      "email_nf", "email_copia", "descricao_nf", "modo_controle", "envia_relatorio", "regra_liberacao",
      "padrao_nome_pedido", "cor", "ativa", "observacoes",
    ]);
    await inserir(
      "cliente",
      d.clientes.map((c) => ({ ...c, representada_id: uuid(c.representada_id) })),
      ["representada_id", "nome", "cnpj", "codigo_externo", "observacoes"],
    );
    await inserir(
      "pedido",
      d.pedidos.map((p) => ({ ...p, representada_id: uuid(p.representada_id), cliente_id: uuid(p.cliente_id) })),
      ["representada_id", "cliente_id", "numero", "referencia", "data_pedido", "entrega_prevista", "data_prevista_faturamento",
        "valor_total", "valor_original", "pct_override", "situacao_comercial", "usa_itens", "observacoes"],
    );
    await inserir(
      "pedido_item",
      d.pedido_itens.map((i) => ({ ...i, pedido_id: uuid(i.pedido_id) })),
      ["pedido_id", "item", "familia", "codigo", "descricao", "qtd", "valor_unit"],
    );
    await inserir(
      "nf_venda",
      d.nfs.map((n) => ({ ...n, representada_id: uuid(n.representada_id), cliente_id: uuid(n.cliente_id), pedido_id: uuid(n.pedido_id) })),
      ["representada_id", "cliente_id", "pedido_id", "numero", "serie", "chave_acesso", "data_emissao", "valor_produtos",
        "valor_total", "pct_override", "simulada", "venda_direta", "observacoes"],
    );
    await inserir(
      "nf_item",
      d.nf_itens.map((i) => ({ ...i, nf_venda_id: uuid(i.nf_venda_id) })),
      ["nf_venda_id", "familia", "codigo", "qtd", "valor_total", "observacoes"],
    );
    await inserir(
      "parcela",
      d.parcelas.map((p) => ({ ...p, nf_venda_id: uuid(p.nf_venda_id) })),
      ["nf_venda_id", "numero", "vencimento_documento", "vencimento_boleto", "valor", "cliente_pagou", "data_pagamento", "observacoes"],
    );
    await inserir(
      "nfse_comissao",
      d.nfses.map((n) => ({ ...n, representada_id: uuid(n.representada_id) })),
      ["representada_id", "numero", "chave_acesso", "data_emissao", "competencia", "referencia", "valor", "enviada_em",
        "data_credito", "data_credito_aproximada", "observacoes"],
    );
    await inserir(
      "apuracao",
      d.apuracoes.map((a) => ({
        ...a,
        representada_id: uuid(a.representada_id),
        nf_venda_id: uuid(a.nf_venda_id),
        parcela_id: uuid(a.parcela_id),
        nfse_id: uuid(a.nfse_id),
      })),
      ["representada_id", "nf_venda_id", "parcela_id", "nfse_id", "mes_referencia", "referencia", "data_pgto_representada",
        "nr_pgto", "base", "pct", "valor_apurado", "origem", "observacoes"],
    );
    await tx`insert into parametro (chave, valor) values ('tolerancia_saldo', ${d.parametros.tolerancia_saldo}), ('tolerancia_comissao', ${d.parametros.tolerancia_comissao})
             on conflict (chave) do update set valor = excluded.valor`;
  });

  console.log("Importação concluída.");

  // --- Conferência: recalcula a partir do banco e compara com a planilha ----
  const lerTabela = async <T>(q: Promise<unknown>) => (await q) as T;
  const dados: Dados = {
    representadas: await lerTabela(sql`select * from representada`),
    clientes: await lerTabela(sql`select * from cliente`),
    pedidos: await lerTabela(sql`select * from pedido`),
    pedido_itens: await lerTabela(sql`select * from pedido_item`),
    nfs: await lerTabela(sql`select * from nf_venda`),
    nf_itens: await lerTabela(sql`select * from nf_item`),
    parcelas: await lerTabela(sql`select * from parcela`),
    apuracoes: await lerTabela(sql`select * from apuracao`),
    nfses: await lerTabela(sql`select * from nfse_comissao`),
    parametros: d.parametros,
  };
  const r = calcular(dados, { hoje });
  const t = lida.totais;

  const linhas: [string, number | null, number][] = [
    ["Comissão já recebida", t.ja_recebida, r.funil.ja_recebida],
    ["A receber firme (card Dashboard, estágio 4 residual)", t.a_receber_firme, r.funil.a_receber_firme_planilha],
    ["A receber firme (matriz / nota a nota)", t.matriz_total_firme, r.funil.a_receber_firme],
    ["Em previsão", t.em_previsao, r.funil.em_previsao.comissao],
    ["Funil 1 - Já recebida", t.funil[0], r.funil.estagios[0].comissao],
    ["Funil 2 - NFS-e emitida", t.funil[1], r.funil.estagios[1].comissao],
    ["Funil 3 - Autorizada sem NFS-e", t.funil[2] ?? 0, r.funil.estagios[2].comissao],
    ["Funil 4 - Faturada sem apuração (residual)", t.funil[3], r.funil.estagio4_residual],
    ["Funil 5 - Pedido firme a faturar", t.funil[4], r.funil.estagios[4].comissao],
    ["Matriz - Vencido", t.matriz_vencido, r.matriz.linhas[0].total_firme],
  ];
  console.log(`\nConferência com a planilha (hoje = ${hoje}):`);
  let ok = true;
  for (const [nome, esperado, obtido] of linhas) {
    const bate = esperado != null && Math.abs(esperado - obtido) < 0.01;
    ok &&= bate;
    console.log(`  ${bate ? "OK " : "DIF"} ${nome.padEnd(55)} planilha ${brl(esperado).padStart(16)}  sistema ${brl(obtido).padStart(16)}`);
  }
  if (r.funil.divergencia.total > 0) {
    console.log(`\nDivergência apurado x previsto: ${brl(r.funil.divergencia.total)}`);
    for (const nf of r.funil.divergencia.nfs) {
      console.log(`  NF ${nf.numero} (${nf.representada.nome}): prevista ${brl(nf.comissao_prevista)} x apurada ${brl(nf.comissao_apurada)} (+${brl(nf.divergencia)})`);
    }
    console.log("  O card 'A receber firme' da planilha desconta essa diferença (residual); a matriz da planilha e o sistema somam nota a nota.");
  }
  await sql.end();
  if (!ok) {
    console.error("\nAlguns totais não bateram.");
    process.exit(2);
  }
  console.log("\nTodos os totais conferem.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
