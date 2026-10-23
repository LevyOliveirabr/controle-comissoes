/**
 * Visão de faturamento: situação dos pedidos, itens que faltam faturar e
 * vencimentos das duplicatas do cliente por mês (meses dinâmicos).
 */
import { inicioMes, somarMeses } from "./datas";
import type { Calculado, PedidoCalculado, PedidoItemCalculado } from "./calculo";

export interface ItemAFaturar extends PedidoItemCalculado {
  pedido: PedidoCalculado;
}

export interface VencimentoMes {
  mes: string;
  valor: number;
  valor_pago: number;
  parcelas: number;
}

export interface Faturamento {
  pedidos: PedidoCalculado[];
  itens_a_faturar: ItemAFaturar[];
  vencimentos: VencimentoMes[];
  total_vencimentos: number;
}

export function calcularFaturamento(c: Calculado): Faturamento {
  const pedidos = c.pedidos.filter((p) => p.ativo);
  const itens_a_faturar: ItemAFaturar[] = pedidos.flatMap((p) =>
    p.itens.filter((i) => i.qtd_a_faturar > 0).map((i) => ({ ...i, pedido: p })),
  );

  const nfsNoFiltro = new Set(c.nfs.filter((n) => n.no_filtro).map((n) => n.id));
  const parcelas = c.dados.parcelas.filter((p) => nfsNoFiltro.has(p.nf_venda_id));
  const porMes = new Map<string, VencimentoMes>();
  for (const parcela of parcelas) {
    const mes = inicioMes(parcela.vencimento_documento);
    const linha = porMes.get(mes) ?? { mes, valor: 0, valor_pago: 0, parcelas: 0 };
    linha.valor += parcela.valor;
    linha.parcelas += 1;
    if (parcela.cliente_pagou) linha.valor_pago += parcela.valor;
    porMes.set(mes, linha);
  }
  const meses = [...porMes.keys()].sort();
  const vencimentos: VencimentoMes[] = [];
  if (meses.length) {
    for (let m = meses[0]; m <= meses[meses.length - 1]; m = somarMeses(m, 1)) {
      vencimentos.push(porMes.get(m) ?? { mes: m, valor: 0, valor_pago: 0, parcelas: 0 });
    }
  }

  return {
    pedidos,
    itens_a_faturar,
    vencimentos,
    total_vencimentos: vencimentos.reduce((s, v) => s + v.valor, 0),
  };
}
