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
import { gravarDados } from "../src/lib/importador/gravar";
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

async function main() {
  const lida = await lerPlanilha(arquivo!);
  const d = lida.dados;
  console.log(`Planilha lida: ${d.representadas.length} representadas, ${d.clientes.length} clientes, ${d.pedidos.length} pedidos, ${d.nfs.length} NFs, ${d.parcelas.length} parcelas, ${d.apuracoes.length} apurações, ${d.nfses.length} NFS-e`);
  for (const a of lida.avisos) console.log(`  aviso: ${a}`);

  const sql = criarConexao(url!);
  if (limpar) console.log("Limpando tabelas...");
  await gravarDados(sql, d, { limpar });

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
