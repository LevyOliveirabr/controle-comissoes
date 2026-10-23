/**
 * Agenda de recebimentos (RN-24/RN-25): toda comissão em aberto com data
 * esperada, em 4 origens. Alimenta a matriz de 12 meses.
 */
import { inicioMes, somarDias, somarMeses } from "./datas";
import { arredondar, somarPor } from "./numeros";
import type { ApuracaoCalculada, Calculado, NfCalculada } from "./calculo";

export type OrigemAgenda =
  | "NF de representacao emitida"
  | "Faturada - aguardando apuracao"
  | "Autorizada - falta emitir sua NF"
  | "Pedido firme a faturar"
  | "Pedido em previsao";

export interface ItemAgenda {
  origem: OrigemAgenda;
  representada_id: string;
  representada: string;
  cliente: string;
  descricao: string;
  confianca: "Firme" | "Previsao";
  /** null = "Sem data definida" (pedido sem data prevista de faturamento). */
  data_esperada: string | null;
  mes: string | null;
  valor: number;
  vencido: boolean;
  referencia: { tipo: "nfse" | "nf" | "apuracao" | "pedido"; id: string };
}

function cicloRepresentada(r: { dias_ate_apuracao: number; prazo_pagamento_dias: number }) {
  return r.dias_ate_apuracao + r.prazo_pagamento_dias;
}

/**
 * Bloco 2 para representada "por parcela" (RN-17, F-Led): uma comissão por
 * parcela, no mês seguinte ao vencimento. Devolve null quando a NF não tem
 * parcelas (cai na regra por NF).
 */
function itensPorParcela(nf: NfCalculada, tolerancia: number): ItemAgenda[] | null {
  if (nf.representada.regra_liberacao !== "por_parcela" || nf.parcelas.length === 0) return null;
  const totalParcelas = somarPor(nf.parcelas, (p) => p.valor);
  if (totalParcelas === 0) return null;
  const apuradoSemParcela = somarPor(
    nf.apuracoes.filter((a) => !a.parcela_id),
    (a) => a.valor_apurado,
  );
  if (apuradoSemParcela > 0) return null; // apuração não rastreada por parcela: usa a regra por NF

  const itens: ItemAgenda[] = [];
  for (const parcela of nf.parcelas) {
    const prevista = nf.comissao_prevista * (parcela.valor / totalParcelas);
    const apurada = somarPor(
      nf.apuracoes.filter((a) => a.parcela_id === parcela.id),
      (a) => a.valor_apurado,
    );
    const pendente = arredondar(prevista - apurada);
    if (pendente <= tolerancia) continue;
    const data = somarMeses(parcela.vencimento_boleto ?? parcela.vencimento_documento, 1);
    itens.push({
      origem: "Faturada - aguardando apuracao",
      representada_id: nf.representada_id,
      representada: nf.representada.nome,
      cliente: nf.cliente.nome,
      descricao: `NF de venda ${nf.numero} - parcela ${parcela.numero}/${nf.parcelas.length}`,
      confianca: "Firme",
      data_esperada: data,
      mes: inicioMes(data),
      valor: pendente,
      vencido: false,
      referencia: { tipo: "nf", id: nf.id },
    });
  }
  return itens;
}

export function calcularAgenda(c: Calculado): ItemAgenda[] {
  const { tolerancia_saldo, tolerancia_comissao } = c.dados.parametros;
  const mesBase = inicioMes(c.hoje);
  const itens: ItemAgenda[] = [];

  // Bloco 1 — NFS-e emitida e ainda não paga: previsão real de crédito.
  for (const nfse of c.nfses) {
    if (nfse.status !== "Aguardando pagamento" || !nfse.no_filtro) continue;
    let valor = nfse.valor;
    let cliente = nfse.clientes.length === 1 ? nfse.clientes[0].nome : "(varios clientes)";
    if (c.filtro.cliente_id) {
      const cobertas = nfse.apuracoes.filter((a) => a.cliente.id === c.filtro.cliente_id);
      valor = somarPor(cobertas, (a) => a.valor_apurado);
      cliente = cobertas[0]?.cliente.nome ?? cliente;
      if (valor <= 0) continue;
    }
    itens.push({
      origem: "NF de representacao emitida",
      representada_id: nfse.representada_id,
      representada: nfse.representada.nome,
      cliente,
      descricao: `NFS-e ${nfse.numero ?? "s/n"} - ${nfse.referencia ?? nfse.competencia ?? ""}`.trim(),
      confianca: "Firme",
      data_esperada: nfse.previsao_credito,
      mes: inicioMes(nfse.previsao_credito),
      valor,
      vencido: false,
      referencia: { tipo: "nfse", id: nfse.id },
    });
  }

  // Bloco 2 — NF faturada, representada ainda não apurou: data NF + dias até apuração + prazo.
  for (const nf of c.nfs) {
    if (!nf.no_filtro || nf.pendente_apuracao <= 0) continue;
    const porParcela = itensPorParcela(nf, tolerancia_comissao);
    if (porParcela) {
      itens.push(...porParcela);
      continue;
    }
    const data = somarDias(nf.data_emissao, cicloRepresentada(nf.representada));
    itens.push({
      origem: "Faturada - aguardando apuracao",
      representada_id: nf.representada_id,
      representada: nf.representada.nome,
      cliente: nf.cliente.nome,
      descricao: `NF de venda ${nf.numero}`,
      confianca: "Firme",
      data_esperada: data,
      mes: inicioMes(data),
      valor: nf.pendente_apuracao,
      vencido: false,
      referencia: { tipo: "nf", id: nf.id },
    });
  }

  // Bloco 3 — apurada no relatório, falta emitir a NFS-e: hoje + prazo.
  const semNfse: ApuracaoCalculada[] = c.apuracoes.filter((a) => a.no_filtro && a.situacao === "NF de comissao nao emitida");
  for (const a of semNfse) {
    const data = somarDias(c.hoje, a.representada.prazo_pagamento_dias);
    itens.push({
      origem: "Autorizada - falta emitir sua NF",
      representada_id: a.representada_id,
      representada: a.representada.nome,
      cliente: a.cliente.nome,
      descricao: `Relatório ${a.referencia ?? a.mes_referencia} - NF ${a.nf.numero}`,
      confianca: "Firme",
      data_esperada: data,
      mes: inicioMes(data),
      valor: a.valor_apurado,
      vencido: false,
      referencia: { tipo: "apuracao", id: a.id },
    });
  }

  // Bloco 4 — pedido Firme/Previsão com saldo a faturar: data prevista + ciclo.
  for (const p of c.pedidos) {
    if (!p.ativo || p.saldo_a_faturar <= tolerancia_saldo) continue;
    if (p.situacao_comercial !== "firme" && p.situacao_comercial !== "previsao") continue;
    const data = p.data_prevista_faturamento ? somarDias(p.data_prevista_faturamento, cicloRepresentada(p.representada)) : null;
    itens.push({
      origem: p.situacao_comercial === "previsao" ? "Pedido em previsao" : "Pedido firme a faturar",
      representada_id: p.representada_id,
      representada: p.representada.nome,
      cliente: p.cliente.nome,
      descricao: `Pedido ${p.numero}`,
      confianca: p.situacao_comercial === "previsao" ? "Previsao" : "Firme",
      data_esperada: data,
      mes: data ? inicioMes(data) : null,
      valor: p.comissao_saldo,
      vencido: false,
      referencia: { tipo: "pedido", id: p.id },
    });
  }

  for (const item of itens) item.vencido = !!item.data_esperada && item.data_esperada < mesBase;
  itens.sort((a, b) => (a.data_esperada ?? "9999").localeCompare(b.data_esperada ?? "9999"));
  return itens;
}
