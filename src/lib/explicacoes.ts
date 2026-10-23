/**
 * Textos que explicam, em português do dia a dia, de onde sai cada número
 * do sistema. São usados no ícone "?" ao lado dos valores, no cabeçalho da
 * página Composição e na página Ajuda. Nada aqui calcula: só explica.
 */
import { brl, data } from "./formato";
import type { NfCalculada, NfseCalculada, PedidoCalculado } from "./motor";

export interface Explicacao {
  titulo: string;
  /** Uma ou duas frases, cabe no balão do "?". */
  curta: string;
  /** Detalhe opcional (mostrado na página Composição). */
  longa?: string;
}

const EXPLICACOES: Record<string, Explicacao> = {
  // --- Cards do Dashboard --------------------------------------------------
  "card:a_receber_firme": {
    titulo: "Comissão a receber (firme)",
    curta:
      "Tudo o que ainda vai entrar de comissão da carteira firme: estágios 2, 3, 4 e 5 do funil somados. Não inclui o que já caiu na conta nem pedidos em previsão.",
    longa:
      "Calculado nota a nota: em cada NF de venda, o sistema compara a comissão prevista (base × %) com o que a representada já apurou e só conta o que falta. " +
      "A planilha usava outro critério, o residual: soma de todas as previstas menos a soma de todas as apurações, de uma vez só. " +
      "Os dois critérios diferem quando alguma representada apura acima do previsto — hoje é o caso da Green, que apurou R$ 111,44 a mais do que o % cadastrado indicava. " +
      "No critério residual esse excedente abate o que falta nas outras notas; no critério nota a nota ele não esconde nada e aparece como alerta de divergência.",
  },
  "card:a_receber_firme_planilha": {
    titulo: "Comissão a receber — critério da planilha (residual)",
    curta:
      "Mesmo número, mas pelo jeito da planilha: estágios 2, 3 e 5 mais o residual (soma de todas as comissões previstas menos tudo o que já foi apurado).",
    longa:
      "O residual mistura as notas: quando uma representada apura acima do previsto (Green, R$ 111,44), esse excedente diminui o que falta nas outras notas. " +
      "Por isso o valor fica um pouco menor que o critério nota a nota. Mostramos os dois para você conferir com a planilha antiga.",
  },
  "card:ja_recebida": {
    titulo: "Comissão já recebida",
    curta: "Soma das apurações cuja NFS-e já tem data de crédito informada — dinheiro que já caiu na sua conta.",
  },
  "card:em_previsao": {
    titulo: "Em previsão",
    curta:
      "Comissão dos pedidos marcados como Previsão (saldo a faturar × %). Fica fora do total firme até você converter o pedido em firme.",
  },
  "card:total_firme": {
    titulo: "Total da carteira firme",
    curta: "Toda a comissão da carteira firme, recebida ou não: os 5 estágios do funil somados.",
  },

  // --- Funil ---------------------------------------------------------------
  "funil:1": {
    titulo: "1 · Já recebida em conta",
    curta: "Apurações ligadas a uma NFS-e com data de crédito. É o que já entrou.",
  },
  "funil:2": {
    titulo: "2 · NF de representação emitida",
    curta: "Apurações ligadas a uma NFS-e já emitida, mas sem data de crédito. Falta só a representada pagar.",
  },
  "funil:3": {
    titulo: "3 · Autorizada, sem NF emitida",
    curta: "Apurações que a representada já confirmou (no relatório de comissão) e que ainda não estão em nenhuma NFS-e sua. Falta você emitir a nota.",
  },
  "funil:4": {
    titulo: "4 · Faturada, sem apuração",
    curta:
      "Soma, NF por NF, da comissão prevista das notas de venda já faturadas que ainda não foram apuradas pela representada (prevista − apurada, só quando sobra algo).",
  },
  "funil:5": {
    titulo: "5 · Pedido firme a faturar",
    curta: "Comissão sobre o que ainda falta faturar dos pedidos firmes: saldo a faturar × % do pedido.",
  },
  pipeline: {
    titulo: "Pipeline de previsão",
    curta: "Pedidos em Previsão que ainda não viraram firme. Cada linha é saldo a faturar × %.",
  },

  // --- Matriz 12 meses -----------------------------------------------------
  "matriz:celula": {
    titulo: "Quando o dinheiro deve cair",
    curta:
      "Soma dos itens firmes da Agenda cuja data esperada cai neste mês, para esta representada. A data vem do ciclo da representada (dias até a apuração + prazo de pagamento).",
  },
  "matriz:total_firme": {
    titulo: "Total firme do mês",
    curta: "Todos os itens firmes da Agenda com data esperada neste mês, somando todas as representadas.",
  },
  "matriz:previsao": {
    titulo: "Previsão do mês",
    curta: "Comissão dos pedidos em Previsão com data esperada neste mês. Não entra no total firme.",
  },
  "matriz:acumulado": {
    titulo: "Acumulado firme",
    curta: "Soma do total firme deste mês com todos os anteriores da tabela (começando pelo Vencido).",
  },
  "matriz:vencido": {
    titulo: "Vencido / já deveria ter caído",
    curta: "Itens firmes cuja data esperada já passou do mês atual e que ainda não foram recebidos. Vale cobrar.",
  },
  "matriz:total": {
    titulo: "Total da matriz",
    curta: "Soma de todas as linhas: é o mesmo valor do card 'Comissão a receber (firme)', só que distribuído no tempo.",
  },

  // --- Consolidado ---------------------------------------------------------
  "consolidado:carteira": { titulo: "Carteira (firme)", curta: "Valor total dos pedidos firmes deste cliente (sem previsões, cancelados e convertidos)." },
  "consolidado:ja_faturado": { titulo: "Já faturado", curta: "Soma do valor total das NFs de venda deste cliente." },
  "consolidado:saldo_a_faturar": { titulo: "Saldo a faturar", curta: "O que falta faturar dos pedidos firmes deste cliente (valor do pedido − NFs, ou por item quando o pedido usa itens)." },
  "consolidado:comissao_total": { titulo: "Comissão total", curta: "Comissão prevista das NFs já emitidas + comissão sobre o saldo a faturar dos pedidos firmes." },
  "consolidado:comissao_apurada": { titulo: "Apurada", curta: "Soma das apurações da representada para as NFs deste cliente (recebidas ou não)." },
  "consolidado:comissao_recebida": { titulo: "Recebida", curta: "Apurações deste cliente que estão em NFS-e com data de crédito." },
  "consolidado:comissao_a_receber": { titulo: "A receber", curta: "Comissão total − recebida: o que ainda vai entrar deste cliente." },

  // --- Faturamento ---------------------------------------------------------
  "faturamento:valor": { titulo: "Vencimentos do mês", curta: "Soma das parcelas (duplicatas) das NFs de venda com vencimento neste mês." },
  "faturamento:pago": { titulo: "Pago pelo cliente", curta: "Parcelas deste mês que você marcou como pagas pelo cliente." },
  "faturamento:parcelas": { titulo: "Parcelas", curta: "Quantidade de parcelas com vencimento neste mês." },

  // --- Páginas de detalhe --------------------------------------------------
  "nf:base": { titulo: "Base de cálculo", curta: "Valor da NF sobre o qual a comissão incide: total da nota ou só os produtos, conforme o cadastro da representada." },
  "nf:pct": { titulo: "% aplicado", curta: "Primeiro vale o % informado na própria NF; se não houver, o % do pedido; se não houver, o % padrão da representada." },
  "nf:prevista": { titulo: "Comissão prevista", curta: "Base × %. É o que você espera receber desta nota." },
  "nf:apurada": { titulo: "Comissão apurada", curta: "Soma das apurações lançadas para esta NF (o que a representada confirmou no relatório)." },
  "nf:recebida": { titulo: "Comissão recebida", curta: "Só as apurações desta NF que estão em NFS-e com data de crédito." },
  "nf:saldo": { titulo: "Saldo de comissão", curta: "Prevista − recebida: o que ainda falta entrar desta nota." },
  "nf:pendente": { titulo: "Pendente de apuração", curta: "Prevista − apurada, quando sobra algo acima da tolerância. É a parte desta nota no estágio 4 do funil." },
  "pedido:pct": { titulo: "% efetivo", curta: "% específico do pedido, se informado; senão o % padrão da representada." },
  "pedido:saldo": { titulo: "Saldo a faturar", curta: "Valor do pedido − soma das NFs ligadas a ele. Se o pedido usa itens, é a soma do saldo de cada item." },
  "pedido:comissao_total": { titulo: "Comissão total", curta: "Valor do pedido × %. Zero para pedidos cancelados ou convertidos." },
  "pedido:comissao_saldo": { titulo: "Comissão sobre o saldo", curta: "Saldo a faturar × %. É a parte deste pedido no estágio 5 (firme) ou no pipeline (previsão)." },
  "nfse:valor": { titulo: "Valor da NFS-e", curta: "O valor que você emitiu. Deve bater com a soma das apurações marcadas como cobertas por esta nota." },
  "nfse:previsao": { titulo: "Previsão de crédito", curta: "Data de emissão + prazo de pagamento cadastrado na representada." },
};

export function explicacao(chave: string): Explicacao | null {
  return EXPLICACOES[chave] ?? null;
}

// ---------------------------------------------------------------------------
// Motivo do status (por que esta NF/pedido/NFS-e está neste status)
// ---------------------------------------------------------------------------

export function motivoStatusNf(nf: NfCalculada, toleranciaComissao: number): string {
  switch (nf.status) {
    case "recebida":
      return `O saldo (prevista − recebida) é ${brl(nf.saldo_comissao)}, dentro da tolerância de ${brl(toleranciaComissao)}: tudo o que esta nota devia gerar já caiu na conta.`;
    case "nao_apurada":
      return nf.representada.envia_relatorio
        ? `Nenhuma apuração foi lançada para esta NF. A ${nf.representada.nome} costuma mandar o relatório cerca de ${nf.representada.dias_ate_apuracao} dias após o faturamento.`
        : `Nenhuma apuração foi lançada para esta NF. A ${nf.representada.nome} não envia relatório: lance a apuração quando emitir sua NFS-e.`;
    case "apurada_aguardando_nfse":
      return "Há apuração lançada, mas pelo menos uma delas ainda não está ligada a uma NFS-e sua. Emita a nota e marque as apurações cobertas.";
    case "nfse_emitida":
      return "Todas as apurações desta NF já estão em NFS-e emitidas, mas alguma ainda não tem data de crédito. Falta a representada pagar.";
  }
}

export function motivoSituacaoPedido(p: PedidoCalculado, toleranciaSaldo: number): string {
  switch (p.situacao_faturamento) {
    case "Cancelado":
      return "Pedido cancelado: não gera comissão e fica fora de todas as somas.";
    case "Convertido":
      return "Previsão que virou um pedido firme: o valor agora está no pedido novo, e este fica fora das somas para não contar duas vezes.";
    case "Nao faturado":
      return "Nenhuma NF de venda foi ligada a este pedido ainda. Todo o valor está no saldo a faturar.";
    case "Faturado parcialmente":
      return `As NFs ligadas somam ${brl(p.ja_faturado)} de ${brl(p.valor_total)}; o restante (${brl(p.saldo_a_faturar)}) ainda deve ser faturado.`;
    case "Faturado integralmente":
      return `As NFs ligadas cobrem o pedido (saldo ${brl(p.saldo_a_faturar)}, dentro da tolerância de ${brl(toleranciaSaldo)}). A comissão agora é acompanhada nota a nota.`;
  }
}

export function motivoStatusNfse(n: NfseCalculada): string {
  if (n.status === "Recebida") return `Data de crédito informada (${data(n.data_credito)}). As apurações cobertas por esta nota contam como recebidas no estágio 1.`;
  return "Ainda sem data de crédito. As apurações cobertas por esta nota ficam no estágio 2 (NF de representação emitida) até você registrar o crédito.";
}
