/**
 * Consolidado por representada × cliente. Considera só pedidos firmes na
 * carteira e no saldo (Previsão, Cancelado e Convertido ficam de fora).
 */
import { somarPor } from "./numeros";
import type { Calculado } from "./calculo";

export interface LinhaConsolidado {
  representada_id: string;
  representada: string;
  cliente_id: string;
  cliente: string;
  carteira: number;
  ja_faturado: number;
  saldo_a_faturar: number;
  comissao_total: number;
  comissao_apurada: number;
  comissao_recebida: number;
  comissao_a_receber: number;
}

export function calcularConsolidado(c: Calculado): LinhaConsolidado[] {
  const linhas: LinhaConsolidado[] = [];
  for (const cliente of c.dados.clientes) {
    const representada = c.representadas.get(cliente.representada_id);
    if (!representada) continue;
    if (c.filtro.representada_id && c.filtro.representada_id !== representada.id) continue;
    if (c.filtro.cliente_id && c.filtro.cliente_id !== cliente.id) continue;

    const pedidos = c.pedidos.filter((p) => p.cliente_id === cliente.id);
    const firmes = pedidos.filter((p) => p.situacao_comercial === "firme");
    const nfs = c.nfs.filter((n) => n.cliente_id === cliente.id);
    const aps = c.apuracoes.filter((a) => a.cliente.id === cliente.id);

    const comissao_total = somarPor(nfs, (n) => n.comissao_prevista) + somarPor(firmes, (p) => p.comissao_saldo);
    const comissao_recebida = somarPor(aps, (a) => a.comissao_recebida);
    linhas.push({
      representada_id: representada.id,
      representada: representada.nome,
      cliente_id: cliente.id,
      cliente: cliente.nome,
      carteira: somarPor(firmes, (p) => p.valor_total),
      ja_faturado: somarPor(nfs, (n) => n.valor_total),
      saldo_a_faturar: somarPor(firmes, (p) => p.saldo_a_faturar),
      comissao_total,
      comissao_apurada: somarPor(aps, (a) => a.valor_apurado),
      comissao_recebida,
      comissao_a_receber: comissao_total - comissao_recebida,
    });
  }
  return linhas;
}
