/**
 * Composição de um número: a lista exata de registros (NF, pedido, NFS-e,
 * apuração, parcela) cuja soma é o valor mostrado em um card, estágio,
 * célula da matriz, linha do consolidado ou total do faturamento.
 *
 * Cada número da interface tem uma "chave" estável (ex.: `funil:4`,
 * `matriz:2026-11-01:rep:<id>`). A página /composicao recebe a chave e
 * monta a lista a partir do mesmo Resultado que gerou o número — por isso
 * o total aqui sempre bate com o que foi clicado.
 */
import { inicioMes } from "./datas";
import { linhasVisiveisConsolidado } from "./consolidado";
import { limitesMatriz, linhaDoItem } from "./matriz";
import { arredondar, somarPor } from "./numeros";
import type { ItemAgenda } from "./agenda";
import type { ApuracaoCalculada, NfCalculada, PedidoCalculado } from "./calculo";
import type { LinhaConsolidado } from "./consolidado";
import type { Resultado } from "./index";

export type TipoItemComposicao = "nf" | "pedido" | "nfse" | "apuracao" | "parcela" | "ajuste";

export interface ItemComposicao {
  tipo: TipoItemComposicao;
  /** id do registro de origem (null em linhas sintéticas, como o residual). */
  id: string | null;
  representada: string;
  cliente: string;
  documento: string;
  data: string | null;
  valor: number;
  href: string | null;
  /** Como o valor desta linha foi obtido (ex.: "R$ 1.000,00 × 5%"). */
  detalhe?: string;
}

export interface Composicao {
  chave: string;
  titulo: string;
  /** Chave de explicação (ver src/lib/explicacoes.ts). */
  explicacao: string;
  /** Rótulo da coluna de data ("Emissão", "Data esperada", "Vencimento"...). */
  rotulo_data: string;
  itens: ItemComposicao[];
  total: number;
}

const ROTULO_LINHA: Record<string, string> = {
  vencido: "Vencido / já deveria ter caído",
  depois: "Depois desses 12 meses",
  sem_data: "Sem data definida",
  total: "Total",
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesCurto(iso: string) {
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}
function pctTexto(v: number) {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}
function brlTexto(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Conversores de registro → linha
// ---------------------------------------------------------------------------

function deApuracao(a: ApuracaoCalculada, r: Resultado): ItemComposicao {
  const nfse = a.nfse ? r.nfses.find((x) => x.id === a.nfse!.id) ?? null : null;
  const data =
    a.situacao === "Recebida"
      ? (a.nfse?.data_credito ?? null)
      : a.situacao === "Aguardando pagamento"
        ? (nfse?.previsao_credito ?? null)
        : (a.data_pgto_representada ?? a.mes_referencia);
  const nfseTexto = a.nfse ? ` · NFS-e ${a.nfse.numero ?? a.nfse.referencia ?? "s/n"}` : "";
  return {
    tipo: "apuracao",
    id: a.id,
    representada: a.representada.nome,
    cliente: a.cliente.nome,
    documento: `Apuração ${a.referencia ?? mesCurto(a.mes_referencia)} — NF ${a.nf.numero}`,
    data,
    valor: a.valor_apurado,
    href: `/apuracoes/${a.id}`,
    detalhe: `${brlTexto(a.base)} × ${pctTexto(a.pct)}${nfseTexto}`,
  };
}

function deNf(nf: NfCalculada, valor: number, detalhe: string): ItemComposicao {
  return {
    tipo: "nf",
    id: nf.id,
    representada: nf.representada.nome,
    cliente: nf.cliente.nome,
    documento: `NF ${nf.numero}`,
    data: nf.data_emissao,
    valor,
    href: `/notas-fiscais/${nf.id}`,
    detalhe,
  };
}

function dePedido(p: PedidoCalculado, valor: number, detalhe: string): ItemComposicao {
  return {
    tipo: "pedido",
    id: p.id,
    representada: p.representada.nome,
    cliente: p.cliente.nome,
    documento: `Pedido ${p.numero}`,
    data: p.data_prevista_faturamento,
    valor,
    href: `/pedidos/${p.id}`,
    detalhe,
  };
}

function deAgenda(i: ItemAgenda): ItemComposicao {
  const tipo = i.referencia.tipo;
  const href = { nfse: `/nfse/${i.referencia.id}`, nf: `/notas-fiscais/${i.referencia.id}`, apuracao: `/apuracoes/${i.referencia.id}`, pedido: `/pedidos/${i.referencia.id}` }[tipo];
  return {
    tipo,
    id: i.referencia.id,
    representada: i.representada,
    cliente: i.cliente,
    documento: i.descricao,
    data: i.data_esperada,
    valor: i.valor,
    href,
    detalhe: i.origem,
  };
}

/** Linhas abaixo de meio centavo (ruído de arredondamento) não aparecem, mas continuam no total. */
const relevante = (i: ItemComposicao) => Math.abs(i.valor) >= 0.005;

function montar(chave: string, titulo: string, explicacao: string, rotulo_data: string, itens: ItemComposicao[]): Composicao {
  return { chave, titulo, explicacao, rotulo_data, itens: itens.filter(relevante), total: somarPor(itens, (i) => i.valor) };
}

// ---------------------------------------------------------------------------
// Fontes do funil (exatamente as mesmas de calcularFunil)
// ---------------------------------------------------------------------------

function itensEstagio(r: Resultado, n: 1 | 2 | 3 | 4 | 5): ItemComposicao[] {
  const aps = r.apuracoes.filter((a) => a.no_filtro);
  switch (n) {
    case 1:
      return aps.filter((a) => a.situacao === "Recebida").map((a) => deApuracao(a, r));
    case 2:
      return aps.filter((a) => a.situacao === "Aguardando pagamento").map((a) => deApuracao(a, r));
    case 3:
      return aps.filter((a) => a.situacao === "NF de comissao nao emitida").map((a) => deApuracao(a, r));
    case 4:
      return r.nfs
        .filter((n) => n.no_filtro && n.pendente_apuracao > 0)
        .map((n) => deNf(n, n.pendente_apuracao, `prevista ${brlTexto(n.comissao_prevista)} − apurada ${brlTexto(n.comissao_apurada)}`));
    case 5:
      return r.pedidos
        .filter((p) => p.ativo && p.situacao_comercial === "firme")
        .map((p) => dePedido(p, p.comissao_saldo, `saldo a faturar ${brlTexto(p.saldo_a_faturar)} × ${pctTexto(p.pct_efetivo)}`));
  }
}

function itensPrevisao(r: Resultado): ItemComposicao[] {
  return r.pedidos
    .filter((p) => p.ativo && p.situacao_comercial === "previsao")
    .map((p) => dePedido(p, p.comissao_saldo, `saldo a faturar ${brlTexto(p.saldo_a_faturar)} × ${pctTexto(p.pct_efetivo)}`));
}

/** Residual da planilha, nota a nota: prevista − apurada de cada NF, inclusive negativos. */
function itensResidual(r: Resultado): ItemComposicao[] {
  const nfs = r.nfs.filter((n) => n.no_filtro);
  const apsPorNf = new Map<string, number>();
  for (const a of r.apuracoes) {
    if (!a.no_filtro) continue;
    apsPorNf.set(a.nf_venda_id, (apsPorNf.get(a.nf_venda_id) ?? 0) + a.valor_apurado);
  }
  const itens = nfs.map((n) => {
    const apurada = apsPorNf.get(n.id) ?? 0;
    const diff = n.comissao_prevista - apurada;
    return deNf(n, diff, diff < 0 ? `apurada ${brlTexto(apurada)} acima da prevista ${brlTexto(n.comissao_prevista)}` : `prevista ${brlTexto(n.comissao_prevista)} − apurada ${brlTexto(apurada)}`);
  });
  // Apurações cuja NF não está no filtro (caso raro): aparecem como ajuste para a soma bater.
  const idsNfs = new Set(nfs.map((n) => n.id));
  const fora = r.apuracoes.filter((a) => a.no_filtro && !idsNfs.has(a.nf_venda_id));
  if (fora.length) {
    itens.push({
      tipo: "ajuste",
      id: null,
      representada: "—",
      cliente: "—",
      documento: `Apurações de NFs fora do filtro (${fora.length})`,
      data: null,
      valor: -somarPor(fora, (a) => a.valor_apurado),
      href: null,
    });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// Consolidado
// ---------------------------------------------------------------------------

type ColunaConsolidado = "carteira" | "ja_faturado" | "saldo_a_faturar" | "comissao_total" | "comissao_apurada" | "comissao_recebida" | "comissao_a_receber";
const COLUNAS_CONSOLIDADO: Record<ColunaConsolidado, { titulo: string; data: string }> = {
  carteira: { titulo: "Carteira (firme)", data: "Faturamento previsto" },
  ja_faturado: { titulo: "Já faturado", data: "Emissão" },
  saldo_a_faturar: { titulo: "Saldo a faturar", data: "Faturamento previsto" },
  comissao_total: { titulo: "Comissão total", data: "Emissão / previsão" },
  comissao_apurada: { titulo: "Comissão apurada", data: "Pgto. representada" },
  comissao_recebida: { titulo: "Comissão recebida", data: "Crédito" },
  comissao_a_receber: { titulo: "Comissão a receber", data: "Emissão / previsão" },
};

function itensConsolidado(r: Resultado, linha: LinhaConsolidado, coluna: ColunaConsolidado): ItemComposicao[] {
  const pedidos = r.pedidos.filter((p) => p.cliente_id === linha.cliente_id);
  const firmes = pedidos.filter((p) => p.situacao_comercial === "firme");
  const nfs = r.nfs.filter((n) => n.cliente_id === linha.cliente_id);
  const aps = r.apuracoes.filter((a) => a.cliente.id === linha.cliente_id);
  switch (coluna) {
    case "carteira":
      return firmes.map((p) => dePedido(p, p.valor_total, "valor do pedido"));
    case "ja_faturado":
      return nfs.map((n) => deNf(n, n.valor_total, "valor total da NF"));
    case "saldo_a_faturar":
      return firmes.map((p) => dePedido(p, p.saldo_a_faturar, `${brlTexto(p.valor_total)} − faturado ${brlTexto(p.ja_faturado)}`));
    case "comissao_total":
      return [
        ...nfs.map((n) => deNf(n, n.comissao_prevista, `${brlTexto(n.base)} × ${pctTexto(n.pct)}`)),
        ...firmes.map((p) => dePedido(p, p.comissao_saldo, `saldo ${brlTexto(p.saldo_a_faturar)} × ${pctTexto(p.pct_efetivo)}`)),
      ];
    case "comissao_apurada":
      return aps.map((a) => ({ ...deApuracao(a, r), data: a.data_pgto_representada ?? a.mes_referencia }));
    case "comissao_recebida":
      return aps.filter((a) => a.situacao === "Recebida").map((a) => deApuracao(a, r));
    case "comissao_a_receber":
      return [
        ...nfs.map((n) => deNf(n, n.comissao_prevista - n.comissao_recebida, `prevista ${brlTexto(n.comissao_prevista)} − recebida ${brlTexto(n.comissao_recebida)}`)),
        ...firmes.map((p) => dePedido(p, p.comissao_saldo, `saldo ${brlTexto(p.saldo_a_faturar)} × ${pctTexto(p.pct_efetivo)}`)),
      ];
  }
}

// ---------------------------------------------------------------------------
// Faturamento (vencimentos das duplicatas)
// ---------------------------------------------------------------------------

function itensVencimentos(r: Resultado, mes: string | "total", tipo: "valor" | "pago"): ItemComposicao[] {
  const nfs = new Map(r.nfs.filter((n) => n.no_filtro).map((n) => [n.id, n]));
  const itens: ItemComposicao[] = [];
  for (const p of r.dados.parcelas) {
    const nf = nfs.get(p.nf_venda_id);
    if (!nf) continue;
    if (mes !== "total" && inicioMes(p.vencimento_documento) !== mes) continue;
    if (tipo === "pago" && !p.cliente_pagou) continue;
    itens.push({
      tipo: "parcela",
      id: p.id,
      representada: nf.representada.nome,
      cliente: nf.cliente.nome,
      documento: `NF ${nf.numero} — parcela ${p.numero}/${nf.n_parcelas}`,
      data: p.vencimento_documento,
      valor: p.valor,
      href: `/notas-fiscais/${nf.id}`,
      detalhe: p.cliente_pagou ? `paga em ${p.data_pagamento ?? "data não informada"}` : "em aberto",
    });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

/**
 * Monta a composição da chave informada. Devolve null para chave desconhecida.
 *
 * Chaves aceitas:
 *  - `card:a_receber_firme` | `card:a_receber_firme_planilha` | `card:ja_recebida` | `card:em_previsao` | `card:total_firme`
 *  - `funil:1` … `funil:5` · `pipeline`
 *  - `matriz:<linha>:<coluna>` — linha = vencido | YYYY-MM-01 | depois | sem_data | total;
 *    coluna = rep:<id> | total_firme | previsao | acumulado
 *  - `consolidado:<cliente_id|total>:<coluna>`
 *  - `faturamento:<YYYY-MM-01|total>:<valor|pago>`
 */
export function composicao(r: Resultado, chave: string): Composicao | null {
  const [tipo, ...resto] = chave.split(":");

  if (tipo === "card") {
    const qual = resto[0];
    if (qual === "a_receber_firme")
      return montar(chave, "Comissão a receber (firme)", chave, "Data", [2, 3, 4, 5].flatMap((n) => itensEstagio(r, n as 2 | 3 | 4 | 5)));
    if (qual === "ja_recebida") return montar(chave, "Comissão já recebida", chave, "Crédito", itensEstagio(r, 1));
    if (qual === "em_previsao") return montar(chave, "Em previsão", chave, "Faturamento previsto", itensPrevisao(r));
    if (qual === "total_firme")
      return montar(chave, "Total da carteira firme", chave, "Data", [1, 2, 3, 4, 5].flatMap((n) => itensEstagio(r, n as 1 | 2 | 3 | 4 | 5)));
    if (qual === "a_receber_firme_planilha") {
      const residual = itensResidual(r);
      const somaResidual = somarPor(residual, (i) => i.valor);
      const itens = [...itensEstagio(r, 2), ...itensEstagio(r, 3), ...residual, ...itensEstagio(r, 5)];
      // O funil usa max(0, arredondar(residual)); a diferença de centavos vira uma linha de ajuste
      // (fica oculta quando é menor que meio centavo, mas entra no total).
      const residualFunil = Math.max(0, arredondar(somaResidual));
      if (Math.abs(residualFunil - somaResidual) > 0) {
        itens.push({ tipo: "ajuste", id: null, representada: "—", cliente: "—", documento: somaResidual < 0 ? "Residual negativo é tratado como zero" : "Arredondamento do residual (critério da planilha)", data: null, valor: residualFunil - somaResidual, href: null });
      }
      return montar(chave, "Comissão a receber — critério da planilha (residual)", chave, "Data", itens);
    }
    return null;
  }

  if (tipo === "funil") {
    const n = Number(resto[0]);
    if (![1, 2, 3, 4, 5].includes(n)) return null;
    const estagio = r.funil.estagios[n - 1];
    const rotuloData = n === 1 ? "Crédito" : n === 2 ? "Previsão de crédito" : n === 3 ? "Pgto. representada" : n === 4 ? "Emissão" : "Faturamento previsto";
    return montar(chave, `${n} · ${estagio.nome}`, chave, rotuloData, itensEstagio(r, n as 1 | 2 | 3 | 4 | 5));
  }

  if (tipo === "pipeline") return montar(chave, "Pipeline de previsão", chave, "Faturamento previsto", itensPrevisao(r));

  if (tipo === "matriz") {
    const [linha, col, repId] = resto;
    if (!linha || !col) return null;
    const limites = limitesMatriz(r.hoje);
    const linhaValida = linha === "total" || linha in ROTULO_LINHA || limites.meses.includes(linha);
    if (!linhaValida) return null;
    const porLinha = (i: ItemAgenda) => linha === "total" || linhaDoItem(i, limites) === linha;
    let itens: ItemAgenda[];
    let tituloCol: string;
    let explicacao: string;
    if (col === "rep") {
      const rep = r.matriz.representadas.find((x) => x.id === repId);
      if (!rep) return null;
      itens = r.agenda.filter((i) => i.confianca === "Firme" && i.representada_id === repId && porLinha(i));
      tituloCol = rep.nome;
      explicacao = "matriz:celula";
    } else if (col === "total_firme") {
      itens = r.agenda.filter((i) => i.confianca === "Firme" && porLinha(i));
      tituloCol = "Total firme";
      explicacao = linha === "total" ? "matriz:total" : "matriz:total_firme";
    } else if (col === "previsao") {
      itens = r.agenda.filter((i) => i.confianca === "Previsao" && porLinha(i));
      tituloCol = "Previsão";
      explicacao = "matriz:previsao";
    } else if (col === "acumulado") {
      // Acumulado: tudo que é firme até esta linha (inclusive), na ordem da tabela.
      const ordem = ["vencido", ...limites.meses, "depois", "sem_data"];
      const ate = ordem.indexOf(linha);
      itens = r.agenda.filter((i) => i.confianca === "Firme" && ordem.indexOf(linhaDoItem(i, limites)) <= ate);
      tituloCol = "Acumulado firme";
      explicacao = "matriz:acumulado";
    } else return null;
    const rotuloLinha = ROTULO_LINHA[linha] ?? mesCurto(linha);
    return montar(chave, `${tituloCol} — ${rotuloLinha}`, linha === "vencido" && col !== "previsao" ? "matriz:vencido" : explicacao, "Data esperada", itens.map(deAgenda));
  }

  if (tipo === "consolidado") {
    const [clienteId, coluna] = resto;
    if (!clienteId || !(coluna in COLUNAS_CONSOLIDADO)) return null;
    const col = coluna as ColunaConsolidado;
    const visiveis = linhasVisiveisConsolidado(r.consolidado);
    const linhas = clienteId === "total" ? visiveis : visiveis.filter((l) => l.cliente_id === clienteId);
    if (clienteId !== "total" && linhas.length === 0) return null;
    const itens = linhas.flatMap((l) => itensConsolidado(r, l, col));
    const quem = clienteId === "total" ? "todos os clientes" : linhas[0].cliente;
    return montar(chave, `${COLUNAS_CONSOLIDADO[col].titulo} — ${quem}`, `consolidado:${col}`, COLUNAS_CONSOLIDADO[col].data, itens);
  }

  if (tipo === "faturamento") {
    const [mes, qual] = resto;
    if (!mes || (qual !== "valor" && qual !== "pago")) return null;
    const rotulo = mes === "total" ? "todos os meses" : mesCurto(mes);
    return montar(chave, `${qual === "pago" ? "Pago pelo cliente" : "Vencimentos das duplicatas"} — ${rotulo}`, `faturamento:${qual}`, "Vencimento", itensVencimentos(r, mes, qual));
  }

  return null;
}
