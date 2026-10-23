/**
 * Pedidos: criar, atualizar e listar em aberto.
 */
import type { Sql } from "postgres";
import { arredondar } from "../../motor/numeros";
import type { Pedido } from "../../motor/tipos";
import { esquemas, validar, z } from "../base";
import { classificar, normalizar } from "./busca";
import { criarCliente, resolverCliente, resolverRepresentada } from "./cadastros";
import { conexao, executar, hojeDe, type Contexto } from "./contexto";
import { ErroAmbiguo, ErroNaoEncontrado, ErroValidacao, type Opcao } from "./erros";
import { brl, calcularBanco, fracao, MESES_LONGO, rotuloMesLongo } from "./motor-db";

const mesAno = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "use AAAA-MM-DD (ou AAAA-MM)");

type PedidoComNomes = Pedido & { representada_nome: string; cliente_nome: string };

const opcaoPedido = (p: PedidoComNomes): Opcao => ({
  id: p.id,
  rotulo: p.numero,
  detalhe: `${p.representada_nome} · ${p.cliente_nome} · ${brl(p.valor_total)} · ${p.situacao_comercial}`,
});

async function listarPedidos(db: Sql, filtro: { representada_id?: string | null; cliente_id?: string | null; abertos?: boolean }) {
  const linhas = await db`
    select p.*, r.nome as representada_nome, c.nome as cliente_nome
    from pedido p join representada r on r.id = p.representada_id join cliente c on c.id = p.cliente_id
    where (${filtro.representada_id ?? null}::uuid is null or p.representada_id = ${filtro.representada_id ?? null}::uuid)
      and (${filtro.cliente_id ?? null}::uuid is null or p.cliente_id = ${filtro.cliente_id ?? null}::uuid)
      and (${!filtro.abertos} or p.situacao_comercial in ('firme', 'previsao'))
    order by p.data_pedido nulls last, p.criado_em`;
  return linhas as unknown as PedidoComNomes[];
}

export interface ReferenciaPedido {
  pedido_id?: string | null;
  numero?: string | null;
  representada?: string | null;
  cliente?: string | null;
}

/**
 * Localiza um pedido por id ou por número aproximado ("668" → "PV 668"),
 * restrito à representada/cliente quando informados.
 */
export async function resolverPedido(db: Sql, ref: ReferenciaPedido, somenteAbertos = false): Promise<PedidoComNomes> {
  if (ref.pedido_id) {
    const [p] = await listarPedidos(db, {}).then((l) => l.filter((x) => x.id === ref.pedido_id));
    if (!p) throw new ErroNaoEncontrado("pedido", ref.pedido_id);
    return p;
  }
  const rep = ref.representada?.trim() ? await resolverRepresentada(db, ref.representada) : null;
  const cli = ref.cliente?.trim() ? await resolverCliente(db, ref.cliente, rep?.id) : null;
  const lista = await listarPedidos(db, { representada_id: rep?.id ?? cli?.representada_id, cliente_id: cli?.id, abertos: somenteAbertos });
  const numero = ref.numero?.trim();
  if (!numero) {
    if (lista.length === 1) return lista[0];
    if (lista.length === 0) throw new ErroNaoEncontrado("pedido", [rep?.nome, cli?.nome].filter(Boolean).join(" / ") || "(sem filtro)", [], "Não há pedido em aberto com esses dados.");
    throw new ErroAmbiguo("pedido", [rep?.nome, cli?.nome].filter(Boolean).join(" / "), lista.slice(0, 8).map(opcaoPedido), "Há mais de um pedido; informe o número.");
  }
  const iguais = lista.filter((p) => normalizar(p.numero) === normalizar(numero));
  if (iguais.length === 1) return iguais[0];
  const soDigitos = numero.replace(/\D/g, "");
  if (soDigitos && soDigitos === numero.trim()) {
    const porNumero = lista.filter((p) => {
      const d = p.numero.match(/\d+/g) ?? [];
      return d.some((x) => Number(x) === Number(soDigitos));
    });
    if (porNumero.length === 1) return porNumero[0];
    if (porNumero.length > 1) throw new ErroAmbiguo("pedido", numero, porNumero.map(opcaoPedido));
  }
  const ranking = classificar(lista, (p) => p.numero, numero).filter((r) => r.pontos >= 0.5);
  if (ranking.length === 1 || (ranking.length > 1 && ranking[0].pontos - ranking[1].pontos >= 0.15)) return ranking[0].item;
  if (ranking.length > 1) throw new ErroAmbiguo("pedido", numero, ranking.slice(0, 6).map((r) => opcaoPedido(r.item)));
  throw new ErroNaoEncontrado("pedido", numero, lista.slice(0, 6).map(opcaoPedido));
}

// --- criar_pedido ----------------------------------------------------------------

const esquemaCriarPedido = z.object({
  representada: esquemas.texto,
  cliente: esquemas.texto,
  valor_total: esquemas.dinheiro,
  numero: z.string().nullish(),
  situacao: z.enum(["firme", "previsao"]).nullish(),
  data_pedido: esquemas.dataIso.nullish(),
  data_prevista_faturamento: mesAno.nullish(),
  entrega_prevista: z.string().nullish(),
  comissao_percentual: z.number().min(0).max(100).nullish(),
  referencia: z.string().nullish(),
  observacoes: z.string().nullish(),
  criar_cliente_se_nao_existir: z.boolean().nullish(),
});

export type EntradaCriarPedido = z.input<typeof esquemaCriarPedido>;

export async function criarPedido(entrada: EntradaCriarPedido, ctx: Contexto) {
  const d = validar(esquemaCriarPedido, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const rep = await resolverRepresentada(tx, d.representada);
    let cliente: { id: string; nome: string };
    let clienteCriado = false;
    try {
      cliente = await resolverCliente(tx, d.cliente, rep.id);
    } catch (e) {
      if (e instanceof ErroNaoEncontrado && d.criar_cliente_se_nao_existir) {
        const r = await criarCliente({ representada: rep.id, nome: d.cliente }, { ...ctx, db: tx });
        cliente = { id: r.cliente.id, nome: r.cliente.nome };
        clienteCriado = r.criado;
      } else throw e;
    }

    const dataPedido = d.data_pedido ?? hoje;
    const dataFat = d.data_prevista_faturamento ? (d.data_prevista_faturamento.length === 7 ? `${d.data_prevista_faturamento}-01` : d.data_prevista_faturamento) : null;
    const entrega = d.entrega_prevista?.trim() || (dataFat ? rotuloMesLongo(dataFat) : null);

    const existentes = await listarPedidos(tx, { representada_id: rep.id, cliente_id: cliente.id });
    let numero = d.numero?.trim();
    if (!numero) {
      const mes = MESES_LONGO[Number(dataPedido.slice(5, 7)) - 1];
      let seq = existentes.length + 1;
      do {
        numero = `Pedido ${String(seq).padStart(2, "0")} - ${mes}`;
        seq++;
      } while (existentes.some((p) => normalizar(p.numero) === normalizar(numero!)));
    } else {
      const repetido = existentes.find((p) => normalizar(p.numero) === normalizar(numero!));
      if (repetido) {
        throw new ErroValidacao(
          `Já existe o pedido "${repetido.numero}" da ${rep.nome} para ${cliente.nome} (${brl(repetido.valor_total)}, ${repetido.situacao_comercial}). Use atualizar_pedido ou informe outro número.`,
        );
      }
    }

    const pct = fracao(d.comissao_percentual);
    const [novo] = await tx`insert into pedido ${tx({
      representada_id: rep.id,
      cliente_id: cliente.id,
      numero,
      referencia: d.referencia?.trim() || null,
      data_pedido: dataPedido,
      entrega_prevista: entrega,
      data_prevista_faturamento: dataFat,
      valor_total: d.valor_total,
      pct_override: pct,
      situacao_comercial: d.situacao ?? "firme",
      usa_itens: false,
      observacoes: d.observacoes?.trim() || null,
    })} returning id`;

    const pctEfetivo = pct ?? rep.pct_padrao;
    const comissao = arredondar(d.valor_total * pctEfetivo);
    const situacao = d.situacao ?? "firme";
    return {
      mensagem:
        `Pedido "${numero}" criado: ${rep.nome} → ${cliente.nome}, ${brl(d.valor_total)} (${situacao === "previsao" ? "previsão" : "firme"}), ` +
        `comissão prevista ${brl(comissao)} (${(pctEfetivo * 100).toLocaleString("pt-BR")}%)` +
        (entrega ? `, entrega ${entrega}` : "") +
        (clienteCriado ? `. Cliente "${cliente.nome}" cadastrado agora na ${rep.nome}.` : "."),
      pedido: {
        id: novo.id as string,
        numero,
        representada: { id: rep.id, nome: rep.nome },
        cliente: { id: cliente.id, nome: cliente.nome, criado_agora: clienteCriado },
        situacao_comercial: situacao,
        valor_total: d.valor_total,
        data_pedido: dataPedido,
        data_prevista_faturamento: dataFat,
        entrega_prevista: entrega,
        comissao_percentual: pctEfetivo * 100,
        comissao_prevista: comissao,
      },
    };
  });
}

// --- atualizar_pedido ------------------------------------------------------------

const esquemaAtualizarPedido = z.object({
  pedido_id: z.string().nullish(),
  numero: z.string().nullish(),
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
  situacao: z.enum(["firme", "previsao", "convertido", "cancelado"]).nullish(),
  valor_total: esquemas.dinheiro.nullish(),
  data_prevista_faturamento: mesAno.nullish(),
  entrega_prevista: z.string().nullish(),
  comissao_percentual: z.number().min(0).max(100).nullish(),
  novo_numero: z.string().nullish(),
  anotacao: z.string().nullish(),
});

export type EntradaAtualizarPedido = z.input<typeof esquemaAtualizarPedido>;

export async function atualizarPedido(entrada: EntradaAtualizarPedido, ctx: Contexto) {
  const d = validar(esquemaAtualizarPedido, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const p = await resolverPedido(tx, d, false);
    const mudancas: Record<string, unknown> = {};
    const descricao: string[] = [];

    if (d.situacao && d.situacao !== p.situacao_comercial) {
      mudancas.situacao_comercial = d.situacao;
      descricao.push(`situação ${p.situacao_comercial} → ${d.situacao}`);
    }
    if (d.valor_total != null && d.valor_total !== p.valor_total) {
      mudancas.valor_total = d.valor_total;
      mudancas.valor_original = p.valor_original ?? p.valor_total;
      descricao.push(`valor ${brl(p.valor_total)} → ${brl(d.valor_total)}`);
    }
    if (d.data_prevista_faturamento) {
      const data = d.data_prevista_faturamento.length === 7 ? `${d.data_prevista_faturamento}-01` : d.data_prevista_faturamento;
      if (data !== p.data_prevista_faturamento) {
        mudancas.data_prevista_faturamento = data;
        descricao.push(`faturamento previsto ${p.data_prevista_faturamento ?? "—"} → ${data}`);
        if (!d.entrega_prevista) mudancas.entrega_prevista = rotuloMesLongo(data);
      }
    }
    if (d.entrega_prevista?.trim() && d.entrega_prevista.trim() !== p.entrega_prevista) {
      mudancas.entrega_prevista = d.entrega_prevista.trim();
      descricao.push(`entrega ${p.entrega_prevista ?? "—"} → ${d.entrega_prevista.trim()}`);
    }
    if (d.comissao_percentual != null) {
      const pct = fracao(d.comissao_percentual);
      if (pct !== p.pct_override) {
        mudancas.pct_override = pct;
        descricao.push(`comissão ${d.comissao_percentual.toLocaleString("pt-BR")}%`);
      }
    }
    if (d.novo_numero?.trim() && d.novo_numero.trim() !== p.numero) {
      mudancas.numero = d.novo_numero.trim();
      descricao.push(`número ${p.numero} → ${d.novo_numero.trim()}`);
    }
    if (d.anotacao?.trim()) {
      const [dd, mm, aa] = [hoje.slice(8, 10), hoje.slice(5, 7), hoje.slice(0, 4)];
      mudancas.observacoes = [p.observacoes, `${dd}/${mm}/${aa}: ${d.anotacao.trim()}`].filter(Boolean).join("\n");
      descricao.push("anotação registrada");
    }

    if (Object.keys(mudancas).length === 0) {
      return { mensagem: `Nada a alterar no pedido "${p.numero}" (${p.representada_nome} / ${p.cliente_nome}).`, alterado: false, pedido: resumoPedido(p) };
    }
    await tx`update pedido set ${tx(mudancas)} where id = ${p.id}`;
    const [atualizado] = await listarPedidos(tx, {}).then((l) => l.filter((x) => x.id === p.id));
    return {
      mensagem: `Pedido "${p.numero}" (${p.representada_nome} / ${p.cliente_nome}) atualizado: ${descricao.join("; ")}.`,
      alterado: true,
      pedido: resumoPedido(atualizado),
    };
  });
}

function resumoPedido(p: PedidoComNomes) {
  return {
    id: p.id,
    numero: p.numero,
    representada: p.representada_nome,
    cliente: p.cliente_nome,
    situacao_comercial: p.situacao_comercial,
    valor_total: p.valor_total,
    valor_original: p.valor_original,
    data_pedido: p.data_pedido,
    data_prevista_faturamento: p.data_prevista_faturamento,
    entrega_prevista: p.entrega_prevista,
    comissao_percentual: p.pct_override != null ? p.pct_override * 100 : null,
    observacoes: p.observacoes,
  };
}

// --- listar_pedidos_em_aberto ----------------------------------------------------

const esquemaListar = z.object({
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
  incluir_previsao: z.boolean().nullish(),
});

export async function listarPedidosEmAberto(entrada: z.input<typeof esquemaListar>, ctx: Contexto) {
  const d = validar(esquemaListar, entrada);
  const db = conexao(ctx);
  const rep = d.representada?.trim() ? await resolverRepresentada(db, d.representada) : null;
  const cli = d.cliente?.trim() ? await resolverCliente(db, d.cliente, rep?.id) : null;
  const r = await calcularBanco(db, ctx, { representada_id: rep?.id ?? cli?.representada_id, cliente_id: cli?.id });
  const tol = r.dados.parametros.tolerancia_saldo;
  const abertos = r.pedidos.filter(
    (p) =>
      p.ativo &&
      p.saldo_a_faturar > tol &&
      (p.situacao_comercial === "firme" || (d.incluir_previsao !== false && p.situacao_comercial === "previsao")),
  );
  const lista = abertos.map((p) => ({
    id: p.id,
    numero: p.numero,
    representada: p.representada.nome,
    cliente: p.cliente.nome,
    situacao_comercial: p.situacao_comercial,
    situacao_faturamento: p.situacao_faturamento,
    valor_total: p.valor_total,
    ja_faturado: p.ja_faturado,
    saldo_a_faturar: p.saldo_a_faturar,
    comissao_percentual: p.pct_efetivo * 100,
    comissao_sobre_saldo: arredondar(p.comissao_saldo),
    data_pedido: p.data_pedido,
    data_prevista_faturamento: p.data_prevista_faturamento,
    entrega_prevista: p.entrega_prevista,
  }));
  const totalSaldo = arredondar(lista.reduce((s, p) => s + p.saldo_a_faturar, 0));
  const totalComissao = arredondar(lista.reduce((s, p) => s + p.comissao_sobre_saldo, 0));
  return {
    mensagem: `${lista.length} pedido(s) em aberto${rep ? ` da ${rep.nome}` : ""}${cli ? ` para ${cli.nome}` : ""}: saldo a faturar ${brl(totalSaldo)}, comissão sobre o saldo ${brl(totalComissao)}.`,
    hoje: hojeDe(ctx),
    total: lista.length,
    saldo_a_faturar: totalSaldo,
    comissao_sobre_saldo: totalComissao,
    pedidos: lista,
  };
}
