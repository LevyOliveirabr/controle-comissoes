/**
 * Tipos de entrada do motor de cálculo. Espelham as tabelas do banco
 * (supabase/migrations) como objetos simples: datas em 'YYYY-MM-DD',
 * valores em number. O motor é puro: não acessa banco nem relógio.
 */

export type ModoControle = "completo" | "simplificado";
export type BaseCalculo = "valor_total_nf" | "valor_produtos";
export type RegraLiberacao = "por_nf" | "por_parcela";
export type SituacaoComercial = "firme" | "previsao" | "convertido" | "cancelado";
export type OrigemApuracao = "relatorio_representada" | "nfse_propria" | "manual";

export interface Representada {
  id: string;
  nome: string;
  cnpj: string | null;
  pct_padrao: number;
  base_calculo: BaseCalculo;
  po_comissao: string | null;
  dias_ate_apuracao: number;
  prazo_pagamento_dias: number;
  email_nf: string | null;
  email_copia: string | null;
  descricao_nf: string | null;
  modo_controle: ModoControle;
  envia_relatorio: boolean;
  regra_liberacao: RegraLiberacao;
  padrao_nome_pedido: string | null;
  cor: string | null;
  ativa: boolean;
  observacoes: string | null;
}

export interface Cliente {
  id: string;
  representada_id: string;
  nome: string;
  cnpj: string | null;
  codigo_externo: string | null;
  observacoes: string | null;
}

export interface Pedido {
  id: string;
  representada_id: string;
  cliente_id: string;
  numero: string;
  referencia: string | null;
  data_pedido: string | null;
  entrega_prevista: string | null;
  data_prevista_faturamento: string | null;
  valor_total: number;
  valor_original: number | null;
  pct_override: number | null;
  situacao_comercial: SituacaoComercial;
  usa_itens: boolean;
  observacoes: string | null;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  item: number | null;
  familia: string;
  codigo: string | null;
  descricao: string | null;
  qtd: number;
  valor_unit: number;
}

export interface NfVenda {
  id: string;
  representada_id: string;
  cliente_id: string;
  pedido_id: string | null;
  numero: string;
  serie: string;
  chave_acesso: string | null;
  data_emissao: string;
  valor_produtos: number;
  valor_total: number;
  pct_override: number | null;
  simulada: boolean;
  venda_direta: boolean;
  observacoes: string | null;
}

export interface NfItem {
  id: string;
  nf_venda_id: string;
  familia: string;
  codigo: string | null;
  qtd: number;
  valor_total: number;
  observacoes: string | null;
}

export interface Parcela {
  id: string;
  nf_venda_id: string;
  numero: number;
  vencimento_documento: string;
  vencimento_boleto: string | null;
  valor: number;
  cliente_pagou: boolean;
  data_pagamento: string | null;
  observacoes: string | null;
}

export interface NfseComissao {
  id: string;
  representada_id: string;
  numero: string | null;
  chave_acesso: string | null;
  data_emissao: string;
  competencia: string | null;
  referencia: string | null;
  valor: number;
  enviada_em: string | null;
  data_credito: string | null;
  data_credito_aproximada: boolean;
  observacoes: string | null;
}

export interface Apuracao {
  id: string;
  representada_id: string;
  nf_venda_id: string;
  parcela_id: string | null;
  nfse_id: string | null;
  mes_referencia: string;
  referencia: string | null;
  data_pgto_representada: string | null;
  nr_pgto: string | null;
  base: number;
  pct: number;
  valor_apurado: number;
  origem: OrigemApuracao;
  observacoes: string | null;
}

export interface Parametros {
  tolerancia_saldo: number;
  tolerancia_comissao: number;
}

export interface Dados {
  representadas: Representada[];
  clientes: Cliente[];
  pedidos: Pedido[];
  pedido_itens: PedidoItem[];
  nfs: NfVenda[];
  nf_itens: NfItem[];
  parcelas: Parcela[];
  apuracoes: Apuracao[];
  nfses: NfseComissao[];
  parametros: Parametros;
}

/** Filtro global (RN-26): vale para todas as visões ao mesmo tempo. */
export interface Filtro {
  representada_id?: string | null;
  cliente_id?: string | null;
}

export const PARAMETROS_PADRAO: Parametros = {
  tolerancia_saldo: 100,
  tolerancia_comissao: 0.05,
};
