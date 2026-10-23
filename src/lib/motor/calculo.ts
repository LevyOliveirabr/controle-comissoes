/**
 * Cálculos por registro: pedidos, NFs de venda, apurações e NFS-e.
 * Reproduz as fórmulas da planilha Controle_Representacoes.xlsx (ver
 * docs: RN-01..RN-23) e acrescenta o que o PDF pede (status em 4 passos,
 * divergência nota a nota, checklist da NFS-e).
 */
import { diferencaDias, somarDias } from "./datas";
import { agruparPor, arredondar, indexarPor, somarPor } from "./numeros";
import type {
  Apuracao,
  Cliente,
  Dados,
  Filtro,
  NfItem,
  NfseComissao,
  NfVenda,
  Parcela,
  Pedido,
  PedidoItem,
  Representada,
} from "./tipos";

// ---------------------------------------------------------------------------
// Rótulos (iguais aos da planilha onde ela os tem)
// ---------------------------------------------------------------------------
export type SituacaoFaturamento =
  | "Cancelado"
  | "Convertido"
  | "Nao faturado"
  | "Faturado parcialmente"
  | "Faturado integralmente";

/** Rótulo de 3 estados da planilha (coluna "Status da comissao"). */
export type StatusComissaoPlanilha = "Comissao recebida" | "Apurada - aguardando pgto" | "Nao apurada ainda";

/** Status em 4 passos do PDF (RN-15). */
export type StatusComissaoNf = "nao_apurada" | "apurada_aguardando_nfse" | "nfse_emitida" | "recebida";

export const ROTULO_STATUS_NF: Record<StatusComissaoNf, string> = {
  nao_apurada: "Não apurada",
  apurada_aguardando_nfse: "Apurada, aguardando NFS-e",
  nfse_emitida: "NFS-e emitida",
  recebida: "Recebida",
};

export type SituacaoApuracao = "Recebida" | "Aguardando pagamento" | "NF de comissao nao emitida";
export type StatusNfse = "Recebida" | "Aguardando pagamento";

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export interface PedidoCalculado extends Pedido {
  representada: Representada;
  cliente: Cliente;
  itens: PedidoItemCalculado[];
  pct_efetivo: number;
  ja_faturado: number;
  saldo_a_faturar: number;
  pct_faturado: number;
  variacao_preco: number;
  situacao_faturamento: SituacaoFaturamento;
  comissao_total: number;
  comissao_saldo: number;
  comissao_apurada: number;
  /** Equivalente ao "Sel" da planilha: não cancelado/convertido e dentro do filtro. */
  ativo: boolean;
  no_filtro: boolean;
}

export interface PedidoItemCalculado extends PedidoItem {
  valor_total: number;
  qtd_faturada: number;
  qtd_a_faturar: number;
  valor_faturado: number;
  saldo_a_faturar: number;
  situacao: string;
}

export interface NfCalculada extends NfVenda {
  representada: Representada;
  cliente: Cliente;
  pedido: PedidoCalculado | null;
  itens: NfItem[];
  parcelas: Parcela[];
  apuracoes: ApuracaoCalculada[];
  base: number;
  pct: number;
  comissao_prevista: number;
  comissao_apurada: number;
  comissao_recebida: number;
  saldo_comissao: number;
  /** prevista − apurada quando > tolerância (estágio 4 "nota a nota"); senão 0. */
  pendente_apuracao: number;
  /** apurada − prevista quando > tolerância (RN-16); senão 0. */
  divergencia: number;
  status_planilha: StatusComissaoPlanilha;
  status: StatusComissaoNf;
  confere_itens: "OK" | "Divergencia" | "Sem itens - simplificado";
  n_parcelas: number;
  no_filtro: boolean;
}

export interface ApuracaoCalculada extends Apuracao {
  nf: NfVenda;
  cliente: Cliente;
  representada: Representada;
  nfse: NfseComissao | null;
  parcela: Parcela | null;
  situacao: SituacaoApuracao;
  comissao_recebida: number;
  no_filtro: boolean;
}

export interface ChecklistNfse {
  po: { ok: boolean; valor: string | null };
  descricao: { ok: boolean; valor: string | null };
  email: { ok: boolean; valor: string | null };
  completo: boolean;
}

export interface NfseCalculada extends NfseComissao {
  representada: Representada;
  apuracoes: ApuracaoCalculada[];
  previsao_credito: string;
  status: StatusNfse;
  dias_em_aberto: number;
  soma_apuracoes: number;
  /** valor − Σ apurações cobertas (RN-19); alerta quando fora da tolerância. */
  diferenca_valor: number;
  alerta_valor: boolean;
  checklist: ChecklistNfse;
  clientes: Cliente[];
  no_filtro: boolean;
}

export interface Calculado {
  dados: Dados;
  hoje: string;
  filtro: Filtro;
  representadas: Map<string, Representada>;
  clientes: Map<string, Cliente>;
  pedidos: PedidoCalculado[];
  nfs: NfCalculada[];
  apuracoes: ApuracaoCalculada[];
  nfses: NfseCalculada[];
}

// ---------------------------------------------------------------------------
// Regras elementares
// ---------------------------------------------------------------------------

/** RN-02 (pedido): % do pedido ou % padrão da representada. */
export function pctEfetivoPedido(pedido: Pick<Pedido, "pct_override">, representada: Pick<Representada, "pct_padrao">): number {
  return pedido.pct_override ?? representada.pct_padrao;
}

/** RN-02 (NF): % manual da NF → % efetivo do pedido → % padrão da representada. */
export function pctNf(
  nf: Pick<NfVenda, "pct_override">,
  pedido: Pick<Pedido, "pct_override"> | null,
  representada: Pick<Representada, "pct_padrao">,
): number {
  if (nf.pct_override != null) return nf.pct_override;
  if (pedido) return pctEfetivoPedido(pedido, representada);
  return representada.pct_padrao;
}

/** RN-01/RN-03: base da comissão conforme a representada. */
export function baseNf(nf: Pick<NfVenda, "valor_produtos" | "valor_total">, representada: Pick<Representada, "base_calculo">): number {
  return representada.base_calculo === "valor_produtos" ? nf.valor_produtos : nf.valor_total;
}

/** RN-07: situação de faturamento derivada. */
export function situacaoFaturamento(
  situacao: Pedido["situacao_comercial"],
  jaFaturado: number,
  saldo: number,
  toleranciaSaldo: number,
): SituacaoFaturamento {
  if (situacao === "cancelado") return "Cancelado";
  if (situacao === "convertido") return "Convertido";
  if (jaFaturado === 0) return "Nao faturado";
  return saldo <= toleranciaSaldo ? "Faturado integralmente" : "Faturado parcialmente";
}

/** Situação da apuração a partir do vínculo direto com a NFS-e. */
export function situacaoApuracao(nfse: Pick<NfseComissao, "data_credito"> | null): SituacaoApuracao {
  if (!nfse) return "NF de comissao nao emitida";
  return nfse.data_credito ? "Recebida" : "Aguardando pagamento";
}

/** RN-21: previsão de crédito = emissão + prazo da representada. */
export function previsaoCredito(nfse: Pick<NfseComissao, "data_emissao">, representada: Pick<Representada, "prazo_pagamento_dias"> | null): string {
  return somarDias(nfse.data_emissao, representada?.prazo_pagamento_dias ?? 30);
}

/** RN-23: checklist pré-envio da NFS-e. */
export function checklistNfse(representada: Representada): ChecklistNfse {
  const po = { ok: !!representada.po_comissao, valor: representada.po_comissao };
  const descricao = { ok: !!representada.descricao_nf, valor: representada.descricao_nf };
  const email = { ok: !!representada.email_nf, valor: representada.email_nf };
  return { po, descricao, email, completo: po.ok && descricao.ok && email.ok };
}

function passaFiltro(filtro: Filtro, representadaId: string, clienteId: string | null): boolean {
  if (filtro.representada_id && filtro.representada_id !== representadaId) return false;
  if (filtro.cliente_id && clienteId !== null && filtro.cliente_id !== clienteId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Cálculo completo
// ---------------------------------------------------------------------------
export function calcularRegistros(dados: Dados, hoje: string, filtro: Filtro = {}): Calculado {
  const { tolerancia_saldo, tolerancia_comissao } = dados.parametros;
  const representadas = indexarPor(dados.representadas, (r) => r.id);
  const clientes = indexarPor(dados.clientes, (c) => c.id);
  const nfsPorPedido = agruparPor(dados.nfs, (n) => n.pedido_id);
  const nfItensPorNf = agruparPor(dados.nf_itens, (i) => i.nf_venda_id);
  const parcelasPorNf = agruparPor(dados.parcelas, (p) => p.nf_venda_id);
  const parcelas = indexarPor(dados.parcelas, (p) => p.id);
  const itensPorPedido = agruparPor(dados.pedido_itens, (i) => i.pedido_id);
  const nfses = indexarPor(dados.nfses, (n) => n.id);
  const nfsIndex = indexarPor(dados.nfs, (n) => n.id);

  const exigir = <T>(v: T | undefined, msg: string): T => {
    if (v === undefined) throw new Error(msg);
    return v;
  };

  // --- Apurações -----------------------------------------------------------
  const apuracoes: ApuracaoCalculada[] = dados.apuracoes.map((a) => {
    const nf = exigir(nfsIndex.get(a.nf_venda_id), `Apuração ${a.id} sem NF ${a.nf_venda_id}`);
    const nfse = a.nfse_id ? nfses.get(a.nfse_id) ?? null : null;
    const situacao = situacaoApuracao(nfse);
    return {
      ...a,
      nf,
      cliente: exigir(clientes.get(nf.cliente_id), `NF ${nf.numero} sem cliente`),
      representada: exigir(representadas.get(a.representada_id), `Apuração ${a.id} sem representada`),
      nfse,
      parcela: a.parcela_id ? parcelas.get(a.parcela_id) ?? null : null,
      situacao,
      comissao_recebida: situacao === "Recebida" ? a.valor_apurado : 0,
      no_filtro: passaFiltro(filtro, a.representada_id, nf.cliente_id),
    };
  });
  const apuracoesPorNf = agruparPor(apuracoes, (a) => a.nf_venda_id);
  const apuracoesPorNfse = agruparPor(apuracoes, (a) => a.nfse_id);

  // --- Pedidos -------------------------------------------------------------
  const pedidos: PedidoCalculado[] = dados.pedidos.map((p) => {
    const representada = exigir(representadas.get(p.representada_id), `Pedido ${p.numero} sem representada`);
    const cliente = exigir(clientes.get(p.cliente_id), `Pedido ${p.numero} sem cliente`);
    const nfs = nfsPorPedido.get(p.id) ?? [];
    const nfItens = nfs.flatMap((n) => nfItensPorNf.get(n.id) ?? []);
    const pct_efetivo = pctEfetivoPedido(p, representada);
    const ja_faturado = arredondar(somarPor(nfs, (n) => n.valor_total));
    const inativo = p.situacao_comercial === "cancelado" || p.situacao_comercial === "convertido";

    const itens: PedidoItemCalculado[] = (itensPorPedido.get(p.id) ?? []).map((it) => {
      const faturados = nfItens.filter((f) => f.familia === it.familia);
      const qtd_faturada = somarPor(faturados, (f) => f.qtd);
      const qtd_a_faturar = it.qtd - qtd_faturada;
      return {
        ...it,
        valor_total: arredondar(it.qtd * it.valor_unit),
        qtd_faturada,
        qtd_a_faturar,
        valor_faturado: arredondar(somarPor(faturados, (f) => f.valor_total)),
        saldo_a_faturar: arredondar(qtd_a_faturar * it.valor_unit),
        situacao: qtd_faturada === 0 ? "Nao faturado" : qtd_a_faturar <= 0 ? "Faturado" : `Faltam ${qtd_a_faturar} pc`,
      };
    });

    // RN-05: saldo pelo valor ou, quando o pedido usa itens, pela soma dos itens.
    let saldo_a_faturar = 0;
    if (!inativo) {
      saldo_a_faturar =
        p.usa_itens && itens.length > 0
          ? arredondar(somarPor(itens, (i) => i.saldo_a_faturar))
          : arredondar(p.valor_total - ja_faturado);
    }
    const comissao_apurada = arredondar(somarPor(nfs, (n) => somarPor(apuracoesPorNf.get(n.id) ?? [], (a) => a.valor_apurado)));
    const no_filtro = passaFiltro(filtro, p.representada_id, p.cliente_id);
    return {
      ...p,
      representada,
      cliente,
      itens,
      pct_efetivo,
      ja_faturado,
      saldo_a_faturar,
      pct_faturado: p.valor_total === 0 ? 0 : ja_faturado / p.valor_total,
      variacao_preco: arredondar(p.valor_total - ja_faturado - saldo_a_faturar),
      situacao_faturamento: situacaoFaturamento(p.situacao_comercial, ja_faturado, saldo_a_faturar, tolerancia_saldo),
      comissao_total: inativo ? 0 : p.valor_total * pct_efetivo,
      comissao_saldo: saldo_a_faturar * pct_efetivo,
      comissao_apurada,
      ativo: !inativo && no_filtro,
      no_filtro,
    };
  });
  const pedidosIndex = indexarPor(pedidos, (p) => p.id);

  // --- NFs -----------------------------------------------------------------
  const nfs: NfCalculada[] = dados.nfs.map((n) => {
    const representada = exigir(representadas.get(n.representada_id), `NF ${n.numero} sem representada`);
    const cliente = exigir(clientes.get(n.cliente_id), `NF ${n.numero} sem cliente`);
    const pedido = n.pedido_id ? pedidosIndex.get(n.pedido_id) ?? null : null;
    const itens = nfItensPorNf.get(n.id) ?? [];
    const parcelasNf = (parcelasPorNf.get(n.id) ?? []).slice().sort((a, b) => a.numero - b.numero);
    const aps = apuracoesPorNf.get(n.id) ?? [];
    const base = baseNf(n, representada);
    const pct = pctNf(n, pedido, representada);
    const comissao_prevista = base * pct;
    const comissao_apurada = arredondar(somarPor(aps, (a) => a.valor_apurado));
    const comissao_recebida = arredondar(somarPor(aps, (a) => a.comissao_recebida));
    const saldo_comissao = comissao_prevista - comissao_recebida;
    const diferenca = arredondar(comissao_prevista - comissao_apurada);
    const pendente_apuracao = diferenca > tolerancia_comissao ? diferenca : 0;
    const divergencia = -diferenca > tolerancia_comissao ? -diferenca : 0;

    const status_planilha: StatusComissaoPlanilha =
      saldo_comissao <= tolerancia_comissao
        ? "Comissao recebida"
        : comissao_apurada === 0
          ? "Nao apurada ainda"
          : "Apurada - aguardando pgto";

    let status: StatusComissaoNf;
    if (saldo_comissao <= tolerancia_comissao) status = "recebida";
    else if (comissao_apurada === 0) status = "nao_apurada";
    else if (aps.every((a) => a.nfse_id)) status = "nfse_emitida";
    else status = "apurada_aguardando_nfse";

    const confere_itens: NfCalculada["confere_itens"] =
      itens.length === 0
        ? "Sem itens - simplificado"
        : arredondar(n.valor_produtos - somarPor(itens, (i) => i.valor_total)) === 0
          ? "OK"
          : "Divergencia";

    return {
      ...n,
      representada,
      cliente,
      pedido,
      itens,
      parcelas: parcelasNf,
      apuracoes: aps,
      base,
      pct,
      comissao_prevista,
      comissao_apurada,
      comissao_recebida,
      saldo_comissao,
      pendente_apuracao,
      divergencia,
      status_planilha,
      status,
      confere_itens,
      n_parcelas: parcelasNf.length,
      no_filtro: passaFiltro(filtro, n.representada_id, n.cliente_id),
    };
  });

  // --- NFS-e ---------------------------------------------------------------
  const nfsesCalc: NfseCalculada[] = dados.nfses.map((x) => {
    const representada = exigir(representadas.get(x.representada_id), `NFS-e ${x.numero} sem representada`);
    const aps = apuracoesPorNfse.get(x.id) ?? [];
    const soma_apuracoes = arredondar(somarPor(aps, (a) => a.valor_apurado));
    const diferenca_valor = arredondar(x.valor - soma_apuracoes);
    const clientesNfse = [...new Map(aps.map((a) => [a.cliente.id, a.cliente])).values()];
    const no_filtro =
      passaFiltro(filtro, x.representada_id, null) &&
      (!filtro.cliente_id || clientesNfse.some((c) => c.id === filtro.cliente_id));
    return {
      ...x,
      representada,
      apuracoes: aps,
      previsao_credito: previsaoCredito(x, representada),
      status: x.data_credito ? "Recebida" : "Aguardando pagamento",
      dias_em_aberto: diferencaDias(x.data_credito ?? hoje, x.data_emissao),
      soma_apuracoes,
      diferenca_valor,
      alerta_valor: aps.length > 0 && Math.abs(diferenca_valor) > tolerancia_comissao,
      checklist: checklistNfse(representada),
      clientes: clientesNfse,
      no_filtro,
    };
  });

  return { dados, hoje, filtro, representadas, clientes, pedidos, nfs, apuracoes, nfses: nfsesCalc };
}
