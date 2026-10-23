/**
 * Grava um conjunto completo de dados (lido da planilha ou de uma fixture) no
 * banco, trocando os ids de origem por uuids. Usado pelo importador e pelos
 * testes de integração.
 */
import type { Sql } from "postgres";
import { emTransacao } from "../db";
import type { Dados } from "../motor/tipos";

export const TABELAS_DE_DADOS = ["apuracao", "nfse_comissao", "parcela", "nf_item", "nf_venda", "pedido_item", "pedido", "cliente", "representada"];

export interface OpcoesGravacao {
  /** Apaga todas as tabelas de dados antes de gravar. */
  limpar?: boolean;
  /** Valor gravado em `app.usuario` para a auditoria. */
  usuario?: string;
}

/** Devolve o mapa id de origem → uuid gerado. */
export async function gravarDados(db: Sql, d: Dados, opcoes: OpcoesGravacao = {}): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const uuid = (id: string | null) => {
    if (id == null) return null;
    const u = ids.get(id);
    if (!u) throw new Error(`Referência não importada: ${id}`);
    return u;
  };

  await emTransacao(db, async (tx) => {
    await tx`select set_config('app.usuario', ${opcoes.usuario ?? "import:planilha"}, true)`;
    if (opcoes.limpar) {
      for (const t of TABELAS_DE_DADOS) await tx.unsafe(`delete from ${t}`);
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
  return ids;
}
