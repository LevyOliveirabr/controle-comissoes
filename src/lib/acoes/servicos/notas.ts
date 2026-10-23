/**
 * Notas fiscais de venda: lançar NF (com parcelas), registrar parcela paga e
 * listar NFs que ainda não tiveram a comissão apurada.
 */
import type { Sql } from "postgres";
import { somarDias } from "../../motor/datas";
import { arredondar } from "../../motor/numeros";
import type { NfVenda, Parcela } from "../../motor/tipos";
import { esquemas, validar, z } from "../base";
import { classificar, normalizar } from "./busca";
import { resolverCliente, resolverRepresentada } from "./cadastros";
import { conexao, executar, hojeDe, type Contexto } from "./contexto";
import { ErroAmbiguo, ErroNaoEncontrado, ErroValidacao, type Opcao } from "./erros";
import { brl, calcularBanco, fracao } from "./motor-db";
import { resolverPedido } from "./pedidos";

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export type NfComNomes = NfVenda & { representada_nome: string; cliente_nome: string; pedido_numero: string | null };

const opcaoNf = (n: NfComNomes): Opcao => ({
  id: n.id,
  rotulo: `NF ${n.numero}`,
  detalhe: `${n.representada_nome} · ${n.cliente_nome} · ${brl(n.valor_total)} · ${dataBr(n.data_emissao)}`,
});

export async function listarNfs(db: Sql, filtro: { representada_id?: string | null; cliente_id?: string | null } = {}) {
  const linhas = await db`
    select n.*, r.nome as representada_nome, c.nome as cliente_nome, p.numero as pedido_numero
    from nf_venda n
      join representada r on r.id = n.representada_id
      join cliente c on c.id = n.cliente_id
      left join pedido p on p.id = n.pedido_id
    where (${filtro.representada_id ?? null}::uuid is null or n.representada_id = ${filtro.representada_id ?? null}::uuid)
      and (${filtro.cliente_id ?? null}::uuid is null or n.cliente_id = ${filtro.cliente_id ?? null}::uuid)
    order by n.data_emissao, n.criado_em`;
  return linhas as unknown as NfComNomes[];
}

export interface ReferenciaNf {
  nf_id?: string | null;
  numero?: string | null;
  representada?: string | null;
  cliente?: string | null;
}

/** Localiza uma NF de venda pelo número (e representada/cliente, se informados). */
export async function resolverNf(db: Sql, ref: ReferenciaNf): Promise<NfComNomes> {
  if (ref.nf_id) {
    const nf = (await listarNfs(db)).find((n) => n.id === ref.nf_id);
    if (!nf) throw new ErroNaoEncontrado("NF", ref.nf_id);
    return nf;
  }
  const rep = ref.representada?.trim() ? await resolverRepresentada(db, ref.representada) : null;
  const cli = ref.cliente?.trim() ? await resolverCliente(db, ref.cliente, rep?.id) : null;
  const lista = await listarNfs(db, { representada_id: rep?.id ?? cli?.representada_id, cliente_id: cli?.id });
  const numero = ref.numero?.trim();
  if (!numero) throw new ErroValidacao("Informe o número da NF.");
  const alvo = normalizar(numero).replace(/^nf\s*/, "");
  const iguais = lista.filter((n) => normalizar(n.numero) === alvo || n.numero.replace(/^0+/, "") === alvo.replace(/^0+/, ""));
  if (iguais.length === 1) return iguais[0];
  if (iguais.length > 1) throw new ErroAmbiguo("NF", numero, iguais.map(opcaoNf), `Há ${iguais.length} NFs com número ${numero}; informe a representada ou o cliente.`);
  const ranking = classificar(lista, (n) => n.numero, alvo).filter((r) => r.pontos >= 0.7);
  if (ranking.length === 1) return ranking[0].item;
  if (ranking.length > 1) throw new ErroAmbiguo("NF", numero, ranking.slice(0, 6).map((r) => opcaoNf(r.item)));
  throw new ErroNaoEncontrado("NF", numero, lista.slice(-6).map(opcaoNf));
}

// --- lancar_nf -------------------------------------------------------------------

const esquemaParcela = z.object({
  vencimento: esquemas.dataIso,
  valor: esquemas.dinheiro,
});

const esquemaItemNf = z.object({
  familia: esquemas.texto,
  qtd: z.number().min(0),
  valor_total: esquemas.dinheiro.nullish(),
  codigo: z.string().nullish(),
});

const esquemaLancarNf = z.object({
  representada: esquemas.texto,
  numero: esquemas.texto,
  valor_total: esquemas.dinheiro,
  itens: z.array(esquemaItemNf).nullish(),
  cliente: z.string().nullish(),
  pedido: z.string().nullish(),
  pedido_id: z.string().nullish(),
  data_emissao: esquemas.dataIso.nullish(),
  valor_produtos: esquemas.dinheiro.nullish(),
  parcelas: z.number().int().min(1).max(48).nullish(),
  prazo_parcela_dias: z.number().int().min(1).max(365).nullish(),
  parcelas_detalhadas: z.array(esquemaParcela).nullish(),
  comissao_percentual: z.number().min(0).max(100).nullish(),
  serie: z.string().nullish(),
  chave_acesso: z.string().nullish(),
  observacoes: z.string().nullish(),
  venda_direta: z.boolean().nullish(),
  ajustar_pedido: z.boolean().nullish(),
});

export type EntradaLancarNf = z.input<typeof esquemaLancarNf>;

export async function lancarNf(entrada: EntradaLancarNf, ctx: Contexto) {
  const d = validar(esquemaLancarNf, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const rep = await resolverRepresentada(tx, d.representada);
    const serie = d.serie?.trim() || "1";
    const jaExiste = (await listarNfs(tx, { representada_id: rep.id })).find(
      (n) => normalizar(n.numero) === normalizar(d.numero) && n.serie === serie,
    );
    if (jaExiste) {
      throw new ErroValidacao(
        `A NF ${jaExiste.numero} da ${rep.nome} já está lançada (${jaExiste.cliente_nome}, ${brl(jaExiste.valor_total)}, ${dataBr(jaExiste.data_emissao)}). Nada foi criado.`,
      );
    }

    // Pedido e cliente
    const antes = await calcularBanco(tx, ctx);
    const tolSaldo = antes.dados.parametros.tolerancia_saldo;
    let pedido: Awaited<ReturnType<typeof resolverPedido>> | null = null;
    let cliente: { id: string; nome: string };
    const avisos: string[] = [];
    if (d.pedido_id || d.pedido?.trim()) {
      pedido = await resolverPedido(tx, { pedido_id: d.pedido_id, numero: d.pedido, representada: rep.id, cliente: d.cliente }, false);
      cliente = { id: pedido.cliente_id, nome: pedido.cliente_nome };
    } else {
      if (!d.cliente?.trim()) throw new ErroValidacao("Informe o cliente da NF (ou o pedido).");
      const c = await resolverCliente(tx, d.cliente, rep.id);
      cliente = { id: c.id, nome: c.nome };
      if (rep.modo_controle === "completo" && !d.venda_direta) {
        const abertos = antes.pedidos.filter(
          (p) => p.cliente_id === c.id && (p.situacao_comercial === "firme" || p.situacao_comercial === "previsao") && p.saldo_a_faturar > tolSaldo,
        );
        if (abertos.length === 1) {
          pedido = await resolverPedido(tx, { pedido_id: abertos[0].id });
          avisos.push(`vinculada automaticamente ao único pedido em aberto, "${pedido.numero}"`);
        } else if (abertos.length > 1) {
          throw new ErroAmbiguo(
            "pedido",
            `${rep.nome} / ${c.nome}`,
            abertos.map((p) => ({ id: p.id, rotulo: p.numero, detalhe: `saldo a faturar ${brl(p.saldo_a_faturar)} · ${p.situacao_comercial}` })),
            `${c.nome} tem ${abertos.length} pedidos em aberto na ${rep.nome}; informe a qual pedido a NF ${d.numero} pertence.`,
          );
        } else {
          throw new ErroValidacao(
            `${c.nome} não tem pedido em aberto na ${rep.nome} (controle completo). Informe o pedido, crie-o com criar_pedido, ou lance com venda_direta=true se a NF não tem pedido.`,
          );
        }
      }
    }

    const dataEmissao = d.data_emissao ?? hoje;
    const [nova] = await tx`insert into nf_venda ${tx({
      representada_id: rep.id,
      cliente_id: cliente.id,
      pedido_id: pedido?.id ?? null,
      numero: d.numero.trim(),
      serie,
      chave_acesso: d.chave_acesso?.replace(/\D/g, "") || null,
      data_emissao: dataEmissao,
      valor_produtos: d.valor_produtos ?? d.valor_total,
      valor_total: d.valor_total,
      pct_override: fracao(d.comissao_percentual),
      simulada: false,
      venda_direta: !pedido && rep.modo_controle === "completo" ? true : false,
      observacoes: d.observacoes?.trim() || null,
    })} returning id`;
    const nfId = nova.id as string;

    // Itens da NF: informados, ou copiados do saldo do pedido quando a NF fecha o pedido.
    const pedidoAntes = pedido ? antes.pedidos.find((p) => p.id === pedido!.id) ?? null : null;
    const itensNf: { familia: string; codigo: string | null; qtd: number; valor_total: number }[] = [];
    if (d.itens?.length) {
      for (const it of d.itens) {
        const doPedido = pedidoAntes?.itens.find((pi) => normalizar(pi.familia) === normalizar(it.familia));
        itensNf.push({
          familia: doPedido?.familia ?? it.familia.trim(),
          codigo: it.codigo?.trim() || doPedido?.codigo || null,
          qtd: it.qtd,
          valor_total: it.valor_total ?? arredondar(it.qtd * (doPedido?.valor_unit ?? 0)),
        });
      }
    } else if (pedidoAntes && pedidoAntes.usa_itens && pedidoAntes.itens.length > 0) {
      const fechaOPedido = Math.abs(d.valor_total - pedidoAntes.saldo_a_faturar) <= Math.max(tolSaldo, pedidoAntes.saldo_a_faturar * 0.01);
      if (fechaOPedido) {
        for (const pi of pedidoAntes.itens) {
          if (pi.qtd_a_faturar <= 0) continue;
          itensNf.push({ familia: pi.familia, codigo: pi.codigo ?? null, qtd: pi.qtd_a_faturar, valor_total: pi.saldo_a_faturar });
        }
        avisos.push(`o pedido controla itens e a NF fecha o saldo: ${itensNf.length} item(ns) copiado(s) do pedido para a NF`);
      } else {
        avisos.push(
          `o pedido "${pedidoAntes.numero}" controla itens por família e a NF veio sem itens — o saldo por item não muda até os itens serem informados (parâmetro "itens" ou pela tela)`,
        );
      }
    }
    for (const it of itensNf) {
      await tx`insert into nf_item ${tx({ nf_venda_id: nfId, familia: it.familia, codigo: it.codigo, qtd: it.qtd, valor_total: it.valor_total })}`;
    }

    // RN-04: pedido sem itens cujo valor subiu com a NF — ajusta guardando o original.
    let pedidoAjustado: { de: number; para: number } | null = null;
    if (pedido && !pedido.usa_itens) {
      const primeiraNf = !antes.nfs.some((n) => n.pedido_id === pedido!.id);
      const diferenca = d.valor_total - pedido.valor_total;
      const dentroDaFaixa = diferenca > 0 && diferenca <= pedido.valor_total * 0.1;
      if (d.ajustar_pedido === true || (d.ajustar_pedido == null && primeiraNf && dentroDaFaixa)) {
        await tx`update pedido set valor_original = coalesce(valor_original, valor_total), valor_total = ${d.valor_total}
                 where id = ${pedido.id} and valor_total <> ${d.valor_total}`;
        pedidoAjustado = { de: pedido.valor_total, para: d.valor_total };
      }
    }

    // Parcelas
    const parcelas: { numero: number; vencimento: string; valor: number }[] = [];
    if (d.parcelas_detalhadas?.length) {
      d.parcelas_detalhadas.forEach((p, i) => parcelas.push({ numero: i + 1, vencimento: p.vencimento, valor: p.valor }));
      const soma = arredondar(parcelas.reduce((s, p) => s + p.valor, 0));
      if (Math.abs(soma - d.valor_total) > 0.05) avisos.push(`a soma das parcelas (${brl(soma)}) difere do total da NF (${brl(d.valor_total)})`);
    } else if (d.parcelas) {
      const prazo = d.prazo_parcela_dias ?? 30;
      const n = d.parcelas;
      const base = Math.floor((d.valor_total / n) * 100) / 100;
      for (let i = 1; i <= n; i++) {
        const valor = i === n ? arredondar(d.valor_total - base * (n - 1)) : base;
        parcelas.push({ numero: i, vencimento: somarDias(dataEmissao, prazo * i), valor });
      }
    }
    for (const p of parcelas) {
      await tx`insert into parcela ${tx({ nf_venda_id: nfId, numero: p.numero, vencimento_documento: p.vencimento, valor: p.valor, cliente_pagou: false })}`;
    }
    if (parcelas.length === 0 && rep.regra_liberacao === "por_parcela") {
      avisos.push(`a ${rep.nome} libera comissão por parcela — informe as parcelas (quantidade ou vencimentos) para a agenda ficar certa`);
    }

    // Recalcula para devolver comissão prevista, saldo do pedido e data esperada.
    const depois = await calcularBanco(tx, ctx);
    const nf = depois.nfs.find((n) => n.id === nfId)!;
    const ped = pedido ? depois.pedidos.find((p) => p.id === pedido!.id) ?? null : null;
    const agenda = depois.agenda.filter((a) => a.referencia.tipo === "nf" && a.referencia.id === nfId);
    const dataEsperada = agenda[0]?.data_esperada ?? null;

    const partes = [
      `NF ${nf.numero} da ${rep.nome} para ${cliente.nome} lançada: ${brl(nf.valor_total)} em ${dataBr(nf.data_emissao)}`,
      pedido ? `vinculada ao pedido "${pedido.numero}"${ped ? ` (saldo a faturar agora ${brl(ped.saldo_a_faturar)} — ${ped.situacao_faturamento.toLowerCase()})` : ""}` : "sem pedido (modo simplificado / venda direta)",
      `comissão prevista ${brl(arredondar(nf.comissao_prevista))} (${(nf.pct * 100).toLocaleString("pt-BR")}%)`,
    ];
    if (parcelas.length) partes.push(`${parcelas.length} parcela(s): ${parcelas.map((p) => `${brl(p.valor)} em ${dataBr(p.vencimento)}`).join(", ")}`);
    if (pedidoAjustado) partes.push(`valor do pedido ajustado de ${brl(pedidoAjustado.de)} para ${brl(pedidoAjustado.para)} (original guardado)`);
    if (dataEsperada) partes.push(`comissão esperada por volta de ${dataBr(dataEsperada)}`);
    if (avisos.length) partes.push(`avisos: ${avisos.join("; ")}`);

    return {
      mensagem: partes.join("; ") + ".",
      nf: {
        id: nf.id,
        numero: nf.numero,
        serie: nf.serie,
        representada: { id: rep.id, nome: rep.nome },
        cliente,
        pedido: pedido ? { id: pedido.id, numero: pedido.numero, saldo_a_faturar: ped?.saldo_a_faturar ?? null, situacao_faturamento: ped?.situacao_faturamento ?? null } : null,
        data_emissao: nf.data_emissao,
        valor_total: nf.valor_total,
        valor_produtos: nf.valor_produtos,
        base_comissao: nf.base,
        comissao_percentual: nf.pct * 100,
        comissao_prevista: arredondar(nf.comissao_prevista),
        comissao_esperada_em: dataEsperada,
        parcelas,
        pedido_ajustado: pedidoAjustado,
        avisos,
      },
    };
  });
}

// --- registrar_parcela_paga ------------------------------------------------------

const esquemaParcelaPaga = z.object({
  nf: z.string().nullish(),
  nf_id: z.string().nullish(),
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
  parcela: z.number().int().min(1).nullish(),
  todas: z.boolean().nullish(),
  data_pagamento: esquemas.dataIso.nullish(),
  desfazer: z.boolean().nullish(),
});

export type EntradaParcelaPaga = z.input<typeof esquemaParcelaPaga>;

export async function registrarParcelaPaga(entrada: EntradaParcelaPaga, ctx: Contexto) {
  const d = validar(esquemaParcelaPaga, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const nf = await resolverNf(tx, { nf_id: d.nf_id, numero: d.nf, representada: d.representada, cliente: d.cliente });
    const parcelas = (await tx`select * from parcela where nf_venda_id = ${nf.id} order by numero`) as unknown as Parcela[];
    if (parcelas.length === 0) throw new ErroValidacao(`A NF ${nf.numero} (${nf.representada_nome}) não tem parcelas cadastradas.`);
    const desfazer = d.desfazer === true;
    let alvo: Parcela[];
    if (d.parcela != null) {
      const p = parcelas.find((x) => x.numero === d.parcela);
      if (!p) throw new ErroNaoEncontrado("parcela", String(d.parcela), parcelas.map((x) => ({ id: x.id, rotulo: `parcela ${x.numero}/${parcelas.length}`, detalhe: `${brl(x.valor)} · venc. ${dataBr(x.vencimento_documento)}${x.cliente_pagou ? " · paga" : ""}` })));
      alvo = [p];
    } else {
      const pendentes = parcelas.filter((x) => x.cliente_pagou === desfazer);
      if (d.todas) alvo = pendentes;
      else if (pendentes.length === 1) alvo = pendentes;
      else if (pendentes.length === 0) {
        return {
          mensagem: `Todas as ${parcelas.length} parcelas da NF ${nf.numero} (${nf.representada_nome} / ${nf.cliente_nome}) já estão ${desfazer ? "em aberto" : "pagas"}.`,
          alterado: false,
          nf: { id: nf.id, numero: nf.numero, representada: nf.representada_nome, cliente: nf.cliente_nome },
          parcelas: parcelas.map(resumoParcela),
        };
      } else {
        throw new ErroAmbiguo(
          "parcela",
          `NF ${nf.numero}`,
          pendentes.map((x) => ({ id: x.id, rotulo: `parcela ${x.numero}/${parcelas.length}`, detalhe: `${brl(x.valor)} · venc. ${dataBr(x.vencimento_documento)}` })),
          `A NF ${nf.numero} tem ${pendentes.length} parcelas ${desfazer ? "pagas" : "em aberto"}; informe o número da parcela ou todas=true.`,
        );
      }
    }
    const dataPg = desfazer ? null : (d.data_pagamento ?? hoje);
    for (const p of alvo) {
      await tx`update parcela set cliente_pagou = ${!desfazer}, data_pagamento = ${dataPg} where id = ${p.id}`;
    }
    const atualizadas = (await tx`select * from parcela where nf_venda_id = ${nf.id} order by numero`) as unknown as Parcela[];
    const restantes = atualizadas.filter((x) => !x.cliente_pagou);
    return {
      mensagem:
        `${desfazer ? "Pagamento desfeito" : "Pagamento registrado"} na NF ${nf.numero} (${nf.representada_nome} / ${nf.cliente_nome}): parcela(s) ${alvo.map((p) => `${p.numero}/${parcelas.length} (${brl(p.valor)})`).join(", ")}` +
        (dataPg ? ` em ${dataBr(dataPg)}` : "") +
        `. ${restantes.length === 0 ? "Todas as parcelas estão pagas." : `Faltam ${restantes.length} parcela(s): ${restantes.map((x) => `${x.numero} (${brl(x.valor)}, venc. ${dataBr(x.vencimento_documento)})`).join(", ")}.`}`,
      alterado: true,
      nf: { id: nf.id, numero: nf.numero, representada: nf.representada_nome, cliente: nf.cliente_nome },
      parcelas: atualizadas.map(resumoParcela),
    };
  });
}

const resumoParcela = (x: Parcela) => ({ numero: x.numero, vencimento: x.vencimento_documento, valor: x.valor, paga: x.cliente_pagou, data_pagamento: x.data_pagamento });

// --- listar_nfs_sem_apuracao -----------------------------------------------------

const esquemaListar = z.object({
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
});

export async function listarNfsSemApuracao(entrada: z.input<typeof esquemaListar>, ctx: Contexto) {
  const d = validar(esquemaListar, entrada);
  const db = conexao(ctx);
  const rep = d.representada?.trim() ? await resolverRepresentada(db, d.representada) : null;
  const cli = d.cliente?.trim() ? await resolverCliente(db, d.cliente, rep?.id) : null;
  const r = await calcularBanco(db, ctx, { representada_id: rep?.id ?? cli?.representada_id, cliente_id: cli?.id });
  const pendentes = r.nfs.filter((n) => n.no_filtro && n.pendente_apuracao > 0);
  const lista = pendentes.map((n) => {
    const itens = r.agenda.filter((a) => a.referencia.tipo === "nf" && a.referencia.id === n.id);
    return {
      id: n.id,
      numero: n.numero,
      representada: n.representada.nome,
      cliente: n.cliente.nome,
      pedido: n.pedido?.numero ?? null,
      data_emissao: n.data_emissao,
      valor_total: n.valor_total,
      base_comissao: n.base,
      comissao_percentual: n.pct * 100,
      comissao_prevista: arredondar(n.comissao_prevista),
      comissao_apurada: n.comissao_apurada,
      falta_apurar: n.pendente_apuracao,
      status: n.status,
      comissao_esperada_em: itens.length === 1 ? itens[0].data_esperada : itens.map((i) => i.data_esperada).filter(Boolean).sort()[0] ?? null,
      parcelas: { total: n.parcelas.length, pagas: n.parcelas.filter((p) => p.cliente_pagou).length },
    };
  });
  const total = arredondar(lista.reduce((s, n) => s + n.falta_apurar, 0));
  return {
    mensagem: `${lista.length} NF(s) faturada(s) ainda sem apuração${rep ? ` da ${rep.nome}` : ""}${cli ? ` para ${cli.nome}` : ""}: ${brl(total)} de comissão a apurar.`,
    hoje: hojeDe(ctx),
    total: lista.length,
    comissao_a_apurar: total,
    nfs: lista,
  };
}
