/**
 * Consultas: resumo (cards + funil) e pendências/agenda de recebimentos.
 */
import { inicioMes, rotuloMes, somarMeses } from "../../motor/datas";
import { arredondar } from "../../motor/numeros";
import { validar, z } from "../base";
import { resolverCliente, resolverRepresentada } from "./cadastros";
import { conexao, hojeDe, type Contexto } from "./contexto";
import { brl, calcularBanco } from "./motor-db";

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "sem data");

const esquemaFiltro = z.object({
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
});

async function filtroDe(entrada: { representada?: string | null; cliente?: string | null }, ctx: Contexto) {
  const db = conexao(ctx);
  const rep = entrada.representada?.trim() ? await resolverRepresentada(db, entrada.representada) : null;
  const cli = entrada.cliente?.trim() ? await resolverCliente(db, entrada.cliente, rep?.id) : null;
  return { db, rep, cli, filtro: { representada_id: rep?.id ?? cli?.representada_id ?? null, cliente_id: cli?.id ?? null } };
}

export async function consultarResumo(entrada: z.input<typeof esquemaFiltro>, ctx: Contexto) {
  const d = validar(esquemaFiltro, entrada);
  const { db, rep, cli, filtro } = await filtroDe(d, ctx);
  const r = await calcularBanco(db, ctx, filtro);
  const f = r.funil;
  const vencido = r.matriz.linhas.find((l) => l.tipo === "vencido");
  const proximos = r.matriz.linhas.filter((l) => l.tipo === "mes").slice(0, 3);
  const tol = r.dados.parametros.tolerancia_saldo;
  const escopo = [rep && `representada ${rep.nome}`, cli && `cliente ${cli.nome}`].filter(Boolean).join(", ");

  const contagens = {
    pedidos_em_aberto: r.pedidos.filter((p) => p.ativo && p.situacao_comercial === "firme" && p.saldo_a_faturar > tol).length,
    pedidos_em_previsao: r.pedidos.filter((p) => p.ativo && p.situacao_comercial === "previsao").length,
    nfs_sem_apuracao: r.nfs.filter((n) => n.no_filtro && n.pendente_apuracao > 0).length,
    apuracoes_sem_nfse: r.apuracoes.filter((a) => a.no_filtro && a.situacao === "NF de comissao nao emitida").length,
    nfse_aguardando_credito: r.nfses.filter((x) => x.no_filtro && x.status === "Aguardando pagamento").length,
  };

  return {
    mensagem:
      `Resumo${escopo ? ` (${escopo})` : ""} em ${dataBr(r.hoje)}: já recebida ${brl(f.ja_recebida)}; a receber firme ${brl(f.a_receber_firme)}; em previsão ${brl(f.em_previsao.comissao)}; vencido (esperado antes deste mês) ${brl(vencido?.total_firme ?? 0)}. ` +
      `Funil: ${f.estagios.map((e) => `${e.numero}) ${e.nome} ${brl(e.comissao)}`).join("; ")}. ` +
      `Pendências: ${contagens.nfs_sem_apuracao} NF(s) sem apuração, ${contagens.apuracoes_sem_nfse} apuração(ões) sem NFS-e, ${contagens.nfse_aguardando_credito} NFS-e aguardando crédito, ${contagens.pedidos_em_aberto} pedido(s) firme(s) a faturar.` +
      (f.divergencia.total > 0 ? ` Atenção: divergência apurado x previsto de ${brl(f.divergencia.total)} (NFs ${f.divergencia.nfs.map((n) => n.numero).join(", ")}).` : ""),
    hoje: r.hoje,
    filtro: { representada: rep?.nome ?? null, cliente: cli?.nome ?? null },
    cards: {
      ja_recebida: arredondar(f.ja_recebida),
      a_receber_firme: arredondar(f.a_receber_firme),
      a_receber_firme_criterio_planilha: arredondar(f.a_receber_firme_planilha),
      em_previsao: { ...f.em_previsao, comissao: arredondar(f.em_previsao.comissao) },
      vencido: arredondar(vencido?.total_firme ?? 0),
      total_carteira_firme: arredondar(f.total_firme),
    },
    funil: f.estagios.map((e) => ({ estagio: e.numero, nome: e.nome, base: arredondar(e.base), comissao: arredondar(e.comissao), pct_do_total: arredondar(e.pct_do_total * 100, 1), proximo_passo: e.proximo_passo })),
    proximos_meses: proximos.map((l) => ({ mes: l.mes ? rotuloMes(l.mes) : l.rotulo, firme: arredondar(l.total_firme), previsao: arredondar(l.em_previsao) })),
    por_representada: r.matriz.representadas.map((x) => ({ representada: x.nome, a_receber_firme: arredondar(r.matriz.totais.por_representada[x.id] ?? 0) })).filter((x) => x.a_receber_firme !== 0 || !rep),
    divergencia: {
      total: f.divergencia.total,
      nfs: f.divergencia.nfs.map((n) => ({ nf: n.numero, representada: n.representada.nome, cliente: n.cliente.nome, prevista: arredondar(n.comissao_prevista), apurada: n.comissao_apurada, diferenca: n.divergencia })),
    },
    contagens,
  };
}

const esquemaPendencias = esquemaFiltro.extend({
  meses: z.number().int().min(1).max(12).nullish(),
  incluir_previsao: z.boolean().nullish(),
});

export async function consultarPendencias(entrada: z.input<typeof esquemaPendencias>, ctx: Contexto) {
  const d = validar(esquemaPendencias, entrada);
  const { db, rep, cli, filtro } = await filtroDe(d, ctx);
  const r = await calcularBanco(db, ctx, filtro);
  const hoje = hojeDe(ctx);
  const meses = d.meses ?? 6;
  const limite = somarMeses(inicioMes(hoje), meses);
  const agenda = r.agenda.filter((a) => d.incluir_previsao !== false || a.confianca === "Firme");

  const item = (a: (typeof agenda)[number]) => ({
    origem: a.origem,
    representada: a.representada,
    cliente: a.cliente,
    descricao: a.descricao,
    confianca: a.confianca,
    data_esperada: a.data_esperada,
    valor: arredondar(a.valor),
    referencia: a.referencia,
  });
  const vencidos = agenda.filter((a) => a.vencido).map(item);
  const atrasados = agenda.filter((a) => !a.vencido && a.data_esperada && a.data_esperada < hoje).map(item);
  const proximos = agenda.filter((a) => a.data_esperada && a.data_esperada >= hoje && a.data_esperada < limite).map(item);
  const depois = agenda.filter((a) => a.data_esperada && a.data_esperada >= limite).map(item);
  const semData = agenda.filter((a) => !a.data_esperada).map(item);
  const soma = (xs: { valor: number }[]) => arredondar(xs.reduce((s, x) => s + x.valor, 0));

  const acoes: string[] = [];
  for (const a of [...vencidos, ...atrasados]) {
    if (a.origem === "NF de representacao emitida") acoes.push(`Cobrar o crédito da ${a.descricao} (${a.representada}, ${brl(a.valor)}) — previsto para ${dataBr(a.data_esperada)}.`);
    else if (a.origem === "Faturada - aguardando apuracao") acoes.push(`Cobrar o relatório/apuração da ${a.representada} sobre a ${a.descricao} (${a.cliente}, ${brl(a.valor)}) — esperado em ${dataBr(a.data_esperada)}.`);
    else if (a.origem === "Pedido firme a faturar") acoes.push(`Verificar o faturamento do ${a.descricao} (${a.representada} / ${a.cliente}, comissão ${brl(a.valor)}) — previsto para ${dataBr(a.data_esperada)}.`);
  }
  for (const a of agenda.filter((x) => x.origem === "Autorizada - falta emitir sua NF")) {
    acoes.push(`Emitir a NFS-e para a ${a.representada}: ${a.descricao} (${a.cliente}, ${brl(a.valor)}).`);
  }

  const matriz = r.matriz.linhas
    .filter((l) => l.tipo === "mes")
    .slice(0, meses)
    .map((l) => ({
      mes: l.mes ? rotuloMes(l.mes) : l.rotulo,
      firme: arredondar(l.total_firme),
      previsao: arredondar(l.em_previsao),
      por_representada: Object.fromEntries(r.matriz.representadas.filter((x) => (l.por_representada[x.id] ?? 0) !== 0).map((x) => [x.nome, arredondar(l.por_representada[x.id] ?? 0)])),
    }));

  const escopo = [rep && `da ${rep.nome}`, cli && `para ${cli.nome}`].filter(Boolean).join(" ");
  return {
    mensagem:
      `Pendências${escopo ? ` ${escopo}` : ""} em ${dataBr(hoje)}: vencido ${brl(soma(vencidos))} (${vencidos.length} item/ns), atrasado neste mês ${brl(soma(atrasados))} (${atrasados.length}), próximos ${meses} meses ${brl(soma(proximos))} (${proximos.length}), depois ${brl(soma(depois))}, sem data ${brl(soma(semData))}. ` +
      (acoes.length ? `Ações sugeridas: ${acoes.slice(0, 8).join(" ")}` : "Nada atrasado."),
    hoje,
    filtro: { representada: rep?.nome ?? null, cliente: cli?.nome ?? null },
    totais: { vencido: soma(vencidos), atrasado_este_mes: soma(atrasados), proximos_meses: soma(proximos), depois: soma(depois), sem_data: soma(semData) },
    vencidos,
    atrasados_este_mes: atrasados,
    proximos,
    depois_do_periodo: depois,
    sem_data: semData,
    por_mes: matriz,
    acoes_sugeridas: acoes,
  };
}
