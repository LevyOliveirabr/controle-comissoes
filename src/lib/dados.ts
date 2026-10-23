import "server-only";
import { sql } from "./db";
import { PARAMETROS_PADRAO, type Dados } from "./motor/tipos";

/**
 * Carrega todas as tabelas de uma vez para o motor. O volume do negócio é
 * pequeno (dezenas de pedidos/mês), então calcular tudo em memória a cada
 * requisição é mais simples e sempre consistente com a planilha.
 */
export async function carregarDados(): Promise<Dados> {
  const db = sql();
  const [representadas, clientes, pedidos, pedido_itens, nfs, nf_itens, parcelas, apuracoes, nfses, parametros] =
    await Promise.all([
      db`select * from representada order by nome`,
      db`select * from cliente order by nome`,
      db`select * from pedido order by data_pedido nulls last, criado_em`,
      db`select * from pedido_item order by item nulls last, criado_em`,
      db`select * from nf_venda order by data_emissao, criado_em`,
      db`select * from nf_item order by criado_em`,
      db`select * from parcela order by nf_venda_id, numero`,
      db`select * from apuracao order by mes_referencia, criado_em`,
      db`select * from nfse_comissao order by data_emissao, criado_em`,
      db`select chave, valor from parametro`,
    ]);

  const param = Object.fromEntries(parametros.map((p) => [p.chave, Number(p.valor)]));
  return {
    representadas: representadas as unknown as Dados["representadas"],
    clientes: clientes as unknown as Dados["clientes"],
    pedidos: pedidos as unknown as Dados["pedidos"],
    pedido_itens: pedido_itens as unknown as Dados["pedido_itens"],
    nfs: nfs as unknown as Dados["nfs"],
    nf_itens: nf_itens as unknown as Dados["nf_itens"],
    parcelas: parcelas as unknown as Dados["parcelas"],
    apuracoes: apuracoes as unknown as Dados["apuracoes"],
    nfses: nfses as unknown as Dados["nfses"],
    parametros: {
      tolerancia_saldo: param.tolerancia_saldo ?? PARAMETROS_PADRAO.tolerancia_saldo,
      tolerancia_comissao: param.tolerancia_comissao ?? PARAMETROS_PADRAO.tolerancia_comissao,
    },
  };
}
