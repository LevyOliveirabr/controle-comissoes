/**
 * Representadas e clientes: busca tolerante por nome e criação de cliente.
 */
import type { Sql } from "postgres";
import type { Cliente, Representada } from "../../motor/tipos";
import { esquemas, validar, z } from "../base";
import { classificar, resolverUnico } from "./busca";
import { conexao, executar, type Contexto } from "./contexto";
import { ErroNaoEncontrado, type Opcao } from "./erros";

const ehUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export const opcaoRepresentada = (r: Representada): Opcao => ({
  id: r.id,
  rotulo: r.nome,
  detalhe: `${(r.pct_padrao * 100).toLocaleString("pt-BR")}% · ${r.modo_controle}`,
});

export type ClienteComRepresentada = Cliente & { representada_nome: string };

export const opcaoCliente = (c: ClienteComRepresentada): Opcao => ({
  id: c.id,
  rotulo: c.nome,
  detalhe: `representada ${c.representada_nome}${c.cnpj ? ` · CNPJ ${c.cnpj}` : ""}`,
});

// --- Resolvedores (uso interno dos demais serviços) ---------------------------

export async function listarRepresentadas(db: Sql): Promise<Representada[]> {
  return (await db`select * from representada order by nome`) as unknown as Representada[];
}

/** Aceita id ou nome aproximado; lança ErroAmbiguo / ErroNaoEncontrado. */
export async function resolverRepresentada(db: Sql, texto: string): Promise<Representada> {
  const todas = await listarRepresentadas(db);
  const t = texto.trim();
  if (ehUuid(t)) {
    const r = todas.find((x) => x.id === t.toLowerCase());
    if (!r) throw new ErroNaoEncontrado("representada", t);
    return r;
  }
  const cnpj = digitos(t);
  if (cnpj.length === 14) {
    const r = todas.find((x) => digitos(x.cnpj) === cnpj);
    if (r) return r;
  }
  return resolverUnico(todas, t, "representada", (r) => r.nome, opcaoRepresentada);
}

export async function listarClientes(db: Sql, representadaId?: string | null): Promise<ClienteComRepresentada[]> {
  const linhas = representadaId
    ? await db`select c.*, r.nome as representada_nome from cliente c join representada r on r.id = c.representada_id where c.representada_id = ${representadaId} order by c.nome`
    : await db`select c.*, r.nome as representada_nome from cliente c join representada r on r.id = c.representada_id order by c.nome`;
  return linhas as unknown as ClienteComRepresentada[];
}

/** Aceita id ou nome aproximado, opcionalmente restrito a uma representada. */
export async function resolverCliente(db: Sql, texto: string, representadaId?: string | null): Promise<ClienteComRepresentada> {
  const lista = await listarClientes(db, representadaId);
  const t = texto.trim();
  if (ehUuid(t)) {
    const c = lista.find((x) => x.id === t.toLowerCase());
    if (!c) throw new ErroNaoEncontrado("cliente", t);
    return c;
  }
  const cnpj = digitos(t);
  if (cnpj.length === 14) {
    const iguais = lista.filter((x) => digitos(x.cnpj) === cnpj);
    if (iguais.length === 1) return iguais[0];
  }
  return resolverUnico(lista, t, "cliente", (c) => c.nome, opcaoCliente);
}

// --- Serviços ------------------------------------------------------------------

const esquemaBuscaRepresentada = z.object({ texto: z.string().nullish() });

export async function buscarRepresentada(entrada: z.input<typeof esquemaBuscaRepresentada>, ctx: Contexto) {
  const { texto } = validar(esquemaBuscaRepresentada, entrada);
  const db = conexao(ctx);
  const todas = await listarRepresentadas(db);
  const clientes = await listarClientes(db);
  const pedidosAbertos = (await db`
    select representada_id, count(*)::int as n from pedido
    where situacao_comercial in ('firme', 'previsao') group by representada_id`) as unknown as { representada_id: string; n: number }[];

  const selecionadas = texto?.trim() ? classificar(todas, (r) => r.nome, texto).filter((p) => p.pontos >= 0.4).map((p) => p.item) : todas;
  return {
    total: selecionadas.length,
    representadas: selecionadas.map((r) => ({
      id: r.id,
      nome: r.nome,
      cnpj: r.cnpj,
      ativa: r.ativa,
      comissao_percentual: r.pct_padrao * 100,
      base_calculo: r.base_calculo,
      modo_controle: r.modo_controle,
      envia_relatorio: r.envia_relatorio,
      regra_liberacao: r.regra_liberacao,
      dias_ate_apuracao: r.dias_ate_apuracao,
      prazo_pagamento_dias: r.prazo_pagamento_dias,
      po_comissao: r.po_comissao,
      clientes: clientes.filter((c) => c.representada_id === r.id).map((c) => c.nome),
      pedidos_em_aberto: pedidosAbertos.find((p) => p.representada_id === r.id)?.n ?? 0,
    })),
  };
}

const esquemaBuscaCliente = z.object({
  texto: z.string().nullish(),
  representada: z.string().nullish(),
});

export async function buscarCliente(entrada: z.input<typeof esquemaBuscaCliente>, ctx: Contexto) {
  const { texto, representada } = validar(esquemaBuscaCliente, entrada);
  const db = conexao(ctx);
  const rep = representada?.trim() ? await resolverRepresentada(db, representada) : null;
  const lista = await listarClientes(db, rep?.id);
  const pedidosAbertos = (await db`
    select cliente_id, count(*)::int as n from pedido
    where situacao_comercial in ('firme', 'previsao') group by cliente_id`) as unknown as { cliente_id: string; n: number }[];
  const selecionados = texto?.trim() ? classificar(lista, (c) => c.nome, texto).filter((p) => p.pontos >= 0.4).map((p) => p.item) : lista;
  return {
    total: selecionados.length,
    representada: rep ? { id: rep.id, nome: rep.nome } : null,
    clientes: selecionados.map((c) => ({
      id: c.id,
      nome: c.nome,
      cnpj: c.cnpj,
      representada: { id: c.representada_id, nome: c.representada_nome },
      pedidos_em_aberto: pedidosAbertos.find((p) => p.cliente_id === c.id)?.n ?? 0,
      observacoes: c.observacoes,
    })),
  };
}

const esquemaCriarCliente = z.object({
  representada: esquemas.texto,
  nome: esquemas.texto,
  cnpj: z.string().nullish(),
  codigo_externo: z.string().nullish(),
  observacoes: z.string().nullish(),
});

/**
 * Cria o cliente na representada. Se já existir um com o mesmo nome (ou o
 * mesmo CNPJ) nessa representada, devolve o existente sem duplicar.
 */
export async function criarCliente(entrada: z.input<typeof esquemaCriarCliente>, ctx: Contexto) {
  const d = validar(esquemaCriarCliente, entrada);
  return executar(ctx, async (tx) => {
    const rep = await resolverRepresentada(tx, d.representada);
    const existentes = await listarClientes(tx, rep.id);
    const cnpj = digitos(d.cnpj);
    const igual =
      existentes.find((c) => c.nome.trim().toLowerCase() === d.nome.trim().toLowerCase()) ??
      (cnpj.length === 14 ? existentes.find((c) => digitos(c.cnpj) === cnpj) : undefined) ??
      classificar(existentes, (c) => c.nome, d.nome).find((p) => p.pontos >= 0.95)?.item;
    if (igual) {
      return {
        criado: false,
        aviso: `Já existe o cliente "${igual.nome}" na ${rep.nome}; nada foi criado.`,
        cliente: { id: igual.id, nome: igual.nome, cnpj: igual.cnpj, representada: { id: rep.id, nome: rep.nome } },
      };
    }
    const [novo] = await tx`insert into cliente ${tx({
      representada_id: rep.id,
      nome: d.nome.trim(),
      cnpj: d.cnpj?.trim() || null,
      codigo_externo: d.codigo_externo?.trim() || null,
      observacoes: d.observacoes?.trim() || null,
    })} returning id, nome, cnpj`;
    return {
      criado: true,
      aviso: null,
      cliente: { id: novo.id as string, nome: novo.nome as string, cnpj: novo.cnpj as string | null, representada: { id: rep.id, nome: rep.nome } },
    };
  });
}
