/**
 * Comissões: apuração (relatório da representada), NFS-e emitida pela Vice
 * Versa e crédito da NFS-e em conta.
 */
import type { Sql } from "postgres";
import { inicioMes, rotuloMes } from "../../motor/datas";
import { arredondar } from "../../motor/numeros";
import type { NfseComissao, Parcela } from "../../motor/tipos";
import { esquemas, validar, z } from "../base";
import { normalizar } from "./busca";
import { resolverRepresentada } from "./cadastros";
import { executar, hojeDe, type Contexto } from "./contexto";
import { ErroAmbiguo, ErroNaoEncontrado, ErroValidacao, type Opcao } from "./erros";
import { brl, calcularBanco, fracao, primeiroDiaDoMes } from "./motor-db";
import { resolverNf } from "./notas";

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const mesAno = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "use AAAA-MM");

// --- registrar_apuracao ----------------------------------------------------------

const esquemaApuracao = z.object({
  nf: z.string().nullish(),
  nf_id: z.string().nullish(),
  representada: z.string().nullish(),
  cliente: z.string().nullish(),
  mes_referencia: mesAno.nullish(),
  base: esquemas.dinheiro.nullish(),
  valor_apurado: esquemas.dinheiro.nullish(),
  comissao_percentual: z.number().min(0).max(100).nullish(),
  parcela: z.number().int().min(1).nullish(),
  data_pgto_representada: esquemas.dataIso.nullish(),
  nr_pgto: z.string().nullish(),
  referencia: z.string().nullish(),
  observacoes: z.string().nullish(),
});

export type EntradaApuracao = z.input<typeof esquemaApuracao>;

export async function registrarApuracao(entrada: EntradaApuracao, ctx: Contexto) {
  const d = validar(esquemaApuracao, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const nfRef = await resolverNf(tx, { nf_id: d.nf_id, numero: d.nf, representada: d.representada, cliente: d.cliente });
    const antes = await calcularBanco(tx, ctx);
    const nf = antes.nfs.find((n) => n.id === nfRef.id)!;
    const tol = antes.dados.parametros.tolerancia_comissao;
    const avisos: string[] = [];

    let parcela: Parcela | null = null;
    if (d.parcela != null) {
      parcela = nf.parcelas.find((p) => p.numero === d.parcela) ?? null;
      if (!parcela) {
        throw new ErroNaoEncontrado("parcela", String(d.parcela), nf.parcelas.map((p) => ({ id: p.id, rotulo: `parcela ${p.numero}/${nf.parcelas.length}`, detalhe: `${brl(p.valor)} · venc. ${dataBr(p.vencimento_documento)}` })));
      }
      const jaApurada = nf.apuracoes.find((a) => a.parcela_id === parcela!.id);
      if (jaApurada) throw new ErroValidacao(`A parcela ${parcela.numero} da NF ${nf.numero} já tem apuração (${brl(jaApurada.valor_apurado)}, ${jaApurada.referencia ?? jaApurada.mes_referencia}).`);
    }

    const pct = fracao(d.comissao_percentual) ?? nf.pct;
    const baseRestante = nf.pct > 0 ? arredondar(nf.pendente_apuracao / nf.pct) : 0;
    let base = d.base ?? (parcela ? parcela.valor : null);
    let valor = d.valor_apurado ?? null;
    if (base == null && valor == null) {
      if (nf.pendente_apuracao <= 0) {
        throw new ErroValidacao(
          `A NF ${nf.numero} (${nf.representada.nome}) já está totalmente apurada: previsto ${brl(arredondar(nf.comissao_prevista))}, apurado ${brl(nf.comissao_apurada)}. Informe base ou valor_apurado se for uma apuração adicional.`,
        );
      }
      base = nf.apuracoes.length === 0 ? nf.base : baseRestante;
    }
    if (base == null && valor != null) base = pct > 0 ? arredondar(valor / pct) : 0;
    if (valor == null) valor = arredondar(base! * pct);
    const previstoParaBase = arredondar(base! * pct);
    if (Math.abs(previstoParaBase - valor) > tol) {
      avisos.push(`o valor apurado (${brl(valor)}) difere de base × % (${brl(previstoParaBase)}) em ${brl(arredondar(valor - previstoParaBase))}`);
    }
    const totalDepois = arredondar(nf.comissao_apurada + valor);
    if (totalDepois - nf.comissao_prevista > tol) {
      avisos.push(`com esta apuração a NF fica apurada acima do previsto (${brl(totalDepois)} x ${brl(arredondar(nf.comissao_prevista))}) — vai aparecer como divergência`);
    }

    const mes = d.mes_referencia ? primeiroDiaDoMes(d.mes_referencia) : inicioMes(d.data_pgto_representada ?? hoje);
    const referencia = d.referencia?.trim() || (parcela ? `${rotuloMes(mes)} - parcela ${parcela.numero}/${nf.parcelas.length}` : rotuloMes(mes));
    const origem = nf.representada.envia_relatorio ? "relatorio_representada" : "manual";
    const [nova] = await tx`insert into apuracao ${tx({
      representada_id: nf.representada_id,
      nf_venda_id: nf.id,
      parcela_id: parcela?.id ?? null,
      nfse_id: null,
      mes_referencia: mes,
      referencia,
      data_pgto_representada: d.data_pgto_representada ?? null,
      nr_pgto: d.nr_pgto?.trim() || null,
      base: base!,
      pct,
      valor_apurado: valor,
      origem,
      observacoes: d.observacoes?.trim() || null,
    })} returning id`;

    const depois = await calcularBanco(tx, ctx);
    const nfDepois = depois.nfs.find((n) => n.id === nf.id)!;
    const pendenteRep = depois.apuracoes.filter((a) => a.representada_id === nf.representada_id && a.situacao === "NF de comissao nao emitida");
    const totalPendenteRep = arredondar(pendenteRep.reduce((s, a) => s + a.valor_apurado, 0));

    return {
      mensagem:
        `Apuração registrada na NF ${nf.numero} (${nf.representada.nome} / ${nf.cliente.nome}), ${referencia}: base ${brl(base!)} × ${(pct * 100).toLocaleString("pt-BR")}% = ${brl(valor)}` +
        (parcela ? ` (parcela ${parcela.numero})` : "") +
        `. NF agora: apurada ${brl(nfDepois.comissao_apurada)} de ${brl(arredondar(nfDepois.comissao_prevista))}` +
        (nfDepois.pendente_apuracao > 0 ? ` (falta ${brl(nfDepois.pendente_apuracao)})` : " (completa)") +
        `. Próximo passo: emitir a NFS-e — a ${nf.representada.nome} tem ${brl(totalPendenteRep)} apurados aguardando NFS-e (${pendenteRep.length} apuração(ões)).` +
        (avisos.length ? ` Avisos: ${avisos.join("; ")}.` : ""),
      apuracao: {
        id: nova.id as string,
        nf: { id: nf.id, numero: nf.numero },
        representada: nf.representada.nome,
        cliente: nf.cliente.nome,
        mes_referencia: mes,
        referencia,
        parcela: parcela ? parcela.numero : null,
        base: base!,
        comissao_percentual: pct * 100,
        valor_apurado: valor,
        origem,
        situacao: "NF de comissao nao emitida",
      },
      nf_depois: {
        comissao_prevista: arredondar(nfDepois.comissao_prevista),
        comissao_apurada: nfDepois.comissao_apurada,
        falta_apurar: nfDepois.pendente_apuracao,
        status: nfDepois.status,
      },
      aguardando_nfse_na_representada: { quantidade: pendenteRep.length, valor: totalPendenteRep },
      avisos,
    };
  });
}

// --- emitir_nfse -----------------------------------------------------------------

const esquemaNfse = z.object({
  representada: esquemas.texto,
  valor: esquemas.dinheiro.nullish(),
  numero: z.string().nullish(),
  data_emissao: esquemas.dataIso.nullish(),
  competencia: mesAno.nullish(),
  referencia: z.string().nullish(),
  nfs: z.array(z.string()).nullish(),
  apuracao_ids: z.array(z.string()).nullish(),
  data_credito: esquemas.dataIso.nullish(),
  enviada_em: esquemas.dataIso.nullish(),
  chave_acesso: z.string().nullish(),
  observacoes: z.string().nullish(),
});

export type EntradaNfse = z.input<typeof esquemaNfse>;

export async function emitirNfse(entrada: EntradaNfse, ctx: Contexto) {
  const d = validar(esquemaNfse, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const rep = await resolverRepresentada(tx, d.representada);
    const antes = await calcularBanco(tx, ctx);
    const tol = antes.dados.parametros.tolerancia_comissao;
    const avisos: string[] = [];
    const competencia = d.competencia ? primeiroDiaDoMes(d.competencia) : null;

    if (d.numero?.trim()) {
      const repetida = antes.nfses.find((x) => x.representada_id === rep.id && x.numero && normalizar(x.numero) === normalizar(d.numero!));
      if (repetida) throw new ErroValidacao(`A NFS-e nº ${repetida.numero} da ${rep.nome} já está lançada (${brl(repetida.valor)}, ${dataBr(repetida.data_emissao)}).`);
    }

    // Apurações cobertas por esta NFS-e.
    const pendentesRep = antes.apuracoes.filter((a) => a.representada_id === rep.id && !a.nfse_id);
    const ids = new Set<string>();
    const criadas: { nf: string; valor: number }[] = [];
    const criarApuracaoDaNf = async (nfId: string) => {
      const n = antes.nfs.find((x) => x.id === nfId)!;
      if (n.pendente_apuracao <= 0) return;
      const base = n.pct > 0 ? arredondar(n.pendente_apuracao / n.pct) : 0;
      const [a] = await tx`insert into apuracao ${tx({
        representada_id: rep.id,
        nf_venda_id: n.id,
        mes_referencia: competencia ?? inicioMes(d.data_emissao ?? hoje),
        referencia: rotuloMes(competencia ?? inicioMes(d.data_emissao ?? hoje)),
        base,
        pct: n.pct,
        valor_apurado: n.pendente_apuracao,
        origem: rep.envia_relatorio ? "manual" : "nfse_propria",
      })} returning id`;
      ids.add(a.id as string);
      criadas.push({ nf: n.numero, valor: n.pendente_apuracao });
    };

    if (d.apuracao_ids?.length) {
      for (const id of d.apuracao_ids) {
        const a = antes.apuracoes.find((x) => x.id === id);
        if (!a || a.representada_id !== rep.id) throw new ErroNaoEncontrado("apuração", id);
        if (a.nfse_id) throw new ErroValidacao(`A apuração ${id} (NF ${a.nf.numero}) já está coberta pela NFS-e ${a.nfse?.numero ?? "s/n"}.`);
        ids.add(id);
      }
    } else if (d.nfs?.length) {
      for (const numero of d.nfs) {
        const nf = await resolverNf(tx, { numero, representada: rep.id });
        const semNfse = pendentesRep.filter((a) => a.nf_venda_id === nf.id);
        if (semNfse.length) semNfse.forEach((a) => ids.add(a.id));
        else await criarApuracaoDaNf(nf.id);
      }
    } else {
      let escolhidas = pendentesRep;
      if (competencia) {
        const doMes = pendentesRep.filter((a) => a.mes_referencia === competencia);
        if (doMes.length) escolhidas = doMes;
        else if (pendentesRep.length) avisos.push(`nenhuma apuração pendente é de ${rotuloMes(competencia)}; cobri todas as pendentes da ${rep.nome}`);
      }
      escolhidas.forEach((a) => ids.add(a.id));
      if (ids.size === 0 && !rep.envia_relatorio) {
        for (const n of antes.nfs.filter((x) => x.representada_id === rep.id && x.pendente_apuracao > 0)) await criarApuracaoDaNf(n.id);
      }
    }
    if (ids.size === 0) {
      throw new ErroValidacao(
        `A ${rep.nome} não tem comissão apurada aguardando NFS-e. Registre a apuração (registrar_apuracao) ou informe em "nfs" as notas de venda que esta NFS-e cobre.`,
      );
    }

    const cobertas = antes.apuracoes.filter((a) => ids.has(a.id));
    const somaCobertas = arredondar(cobertas.reduce((s, a) => s + a.valor_apurado, 0) + criadas.reduce((s, c) => s + c.valor, 0));
    const valor = d.valor ?? somaCobertas;
    if (Math.abs(valor - somaCobertas) > tol) {
      avisos.push(`o valor da NFS-e (${brl(valor)}) difere da soma das apurações cobertas (${brl(somaCobertas)}) em ${brl(arredondar(valor - somaCobertas))}`);
    }

    const dataEmissao = d.data_emissao ?? hoje;
    const comp = competencia ?? inicioMes(dataEmissao);
    const nfsCobertas = [...new Set([...cobertas.map((a) => a.nf.numero), ...criadas.map((c) => c.nf)])];
    const referencia = d.referencia?.trim() || `${rotuloMes(comp)} - NF${nfsCobertas.length > 1 ? "s" : ""} ${nfsCobertas.join(", ")}`;
    const [nova] = await tx`insert into nfse_comissao ${tx({
      representada_id: rep.id,
      numero: d.numero?.trim() || null,
      chave_acesso: d.chave_acesso?.trim() || null,
      data_emissao: dataEmissao,
      competencia: comp,
      referencia,
      valor,
      enviada_em: d.enviada_em ?? null,
      data_credito: d.data_credito ?? null,
      data_credito_aproximada: false,
      observacoes: d.observacoes?.trim() || null,
    })} returning id`;
    const nfseId = nova.id as string;
    await tx`update apuracao set nfse_id = ${nfseId} where id = any(${[...ids]}::uuid[]) and representada_id = ${rep.id}`;

    const depois = await calcularBanco(tx, ctx);
    const nfse = depois.nfses.find((x) => x.id === nfseId)!;
    const check = nfse.checklist;
    const pendentesChecklist = [!check.po.ok && "PO de comissão", !check.descricao.ok && "descrição obrigatória", !check.email.ok && "e-mail de envio"].filter(Boolean) as string[];

    return {
      mensagem:
        `NFS-e ${nfse.numero ? `nº ${nfse.numero} ` : ""}da ${rep.nome} registrada: ${brl(valor)} emitida em ${dataBr(dataEmissao)}, ref. ${referencia}, cobrindo ${ids.size} apuração(ões)` +
        (criadas.length ? ` (${criadas.length} criada(s) agora a partir das NFs ${criadas.map((c) => c.nf).join(", ")})` : "") +
        `. Previsão de crédito: ${dataBr(nfse.previsao_credito)} (prazo de ${rep.prazo_pagamento_dias} dias)` +
        (d.data_credito ? `; crédito já registrado em ${dataBr(d.data_credito)}` : "") +
        `. Checklist de envio: ${pendentesChecklist.length ? `faltam ${pendentesChecklist.join(", ")} no cadastro da representada` : "PO, descrição e e-mail OK"}` +
        (check.po.valor ? ` (PO ${check.po.valor}` : "") +
        (check.email.valor ? `${check.po.valor ? ", " : " ("}enviar para ${check.email.valor}${rep.email_copia ? ` com cópia ${rep.email_copia}` : ""})` : check.po.valor ? ")" : "") +
        (avisos.length ? `. Avisos: ${avisos.join("; ")}` : "") +
        ".",
      nfse: {
        id: nfseId,
        numero: nfse.numero,
        representada: { id: rep.id, nome: rep.nome },
        data_emissao: dataEmissao,
        competencia: comp,
        referencia,
        valor,
        previsao_credito: nfse.previsao_credito,
        status: nfse.status,
        soma_apuracoes: nfse.soma_apuracoes,
        apuracoes_cobertas: nfse.apuracoes.map((a) => ({ id: a.id, nf: a.nf.numero, cliente: a.cliente.nome, referencia: a.referencia, valor_apurado: a.valor_apurado })),
        checklist: { po: check.po, descricao: check.descricao, email: check.email, completo: check.completo, email_copia: rep.email_copia },
        avisos,
      },
    };
  });
}

// --- registrar_credito_nfse ------------------------------------------------------

type NfseComNome = NfseComissao & { representada_nome: string };

const opcaoNfse = (x: NfseComNome): Opcao => ({
  id: x.id,
  rotulo: `NFS-e ${x.numero ?? "s/n"}`,
  detalhe: `${x.representada_nome} · ${brl(x.valor)} · ${x.referencia ?? (x.competencia ? rotuloMes(x.competencia) : "")} · emitida ${dataBr(x.data_emissao)}${x.data_credito ? ` · creditada ${dataBr(x.data_credito)}` : ""}`,
});

export interface ReferenciaNfse {
  nfse_id?: string | null;
  numero?: string | null;
  representada?: string | null;
  competencia?: string | null;
}

export async function resolverNfse(db: Sql, ref: ReferenciaNfse, somenteAbertas: boolean): Promise<{ nfse: NfseComNome; aviso: string | null }> {
  const todas = (await db`
    select x.*, r.nome as representada_nome from nfse_comissao x join representada r on r.id = x.representada_id
    order by x.data_emissao desc, x.criado_em desc`) as unknown as NfseComNome[];
  if (ref.nfse_id) {
    const x = todas.find((n) => n.id === ref.nfse_id);
    if (!x) throw new ErroNaoEncontrado("NFS-e", ref.nfse_id);
    return { nfse: x, aviso: null };
  }
  const rep = ref.representada?.trim() ? await resolverRepresentada(db, ref.representada) : null;
  let lista = todas.filter((x) => (!rep || x.representada_id === rep.id) && (!somenteAbertas || !x.data_credito));
  const rotulo = rep ? `da ${rep.nome}` : "";
  if (ref.numero?.trim()) {
    const alvo = normalizar(ref.numero).replace(/^(nfse|nfs-e|nf)\s*/, "");
    const iguais = lista.filter((x) => x.numero && normalizar(x.numero) === alvo);
    if (iguais.length === 1) return { nfse: iguais[0], aviso: null };
    if (iguais.length > 1) throw new ErroAmbiguo("NFS-e", ref.numero, iguais.map(opcaoNfse));
    throw new ErroNaoEncontrado("NFS-e", ref.numero, lista.slice(0, 6).map(opcaoNfse), `Não encontrei NFS-e nº ${ref.numero} ${rotulo}${somenteAbertas ? " aguardando crédito" : ""}.`);
  }
  if (ref.competencia) {
    const mes = primeiroDiaDoMes(ref.competencia);
    const doMes = lista.filter((x) => x.competencia === mes || (x.referencia && normalizar(x.referencia).includes(normalizar(rotuloMes(mes)))));
    if (doMes.length === 1) return { nfse: doMes[0], aviso: null };
    if (doMes.length > 1) throw new ErroAmbiguo("NFS-e", rotuloMes(mes), doMes.map(opcaoNfse), `Há ${doMes.length} NFS-e ${rotulo} de ${rotuloMes(mes)}; informe o número.`);
    if (lista.length === 1) {
      return { nfse: lista[0], aviso: `não há NFS-e de ${rotuloMes(mes)}; usei a única em aberto ${rotulo}: ${lista[0].referencia ?? lista[0].numero ?? ""}` };
    }
    lista = lista.length ? lista : todas.filter((x) => !rep || x.representada_id === rep.id);
    throw new ErroNaoEncontrado("NFS-e", rotuloMes(mes), lista.slice(0, 6).map(opcaoNfse), `Não encontrei NFS-e ${rotulo} de ${rotuloMes(mes)}${somenteAbertas ? " aguardando crédito" : ""}.`);
  }
  if (lista.length === 1) return { nfse: lista[0], aviso: null };
  if (lista.length === 0) throw new ErroNaoEncontrado("NFS-e", rotulo || "(todas)", [], `Não há NFS-e ${rotulo} aguardando crédito.`);
  throw new ErroAmbiguo("NFS-e", rotulo || "(todas)", lista.slice(0, 8).map(opcaoNfse), `Há ${lista.length} NFS-e ${rotulo} aguardando crédito; informe o número ou o mês.`);
}

const esquemaCredito = z.object({
  representada: z.string().nullish(),
  nfse_id: z.string().nullish(),
  numero: z.string().nullish(),
  competencia: mesAno.nullish(),
  data_credito: esquemas.dataIso.nullish(),
  aproximada: z.boolean().nullish(),
  valor_creditado: esquemas.dinheiro.nullish(),
  desfazer: z.boolean().nullish(),
});

export type EntradaCredito = z.input<typeof esquemaCredito>;

export async function registrarCreditoNfse(entrada: EntradaCredito, ctx: Contexto) {
  const d = validar(esquemaCredito, entrada);
  const hoje = hojeDe(ctx);
  return executar(ctx, async (tx) => {
    const desfazer = d.desfazer === true;
    const { nfse, aviso } = await resolverNfse(tx, d, !desfazer);
    const avisos = aviso ? [aviso] : [];
    if (desfazer && !nfse.data_credito) throw new ErroValidacao(`A NFS-e ${nfse.numero ?? "s/n"} da ${nfse.representada_nome} não tem crédito registrado.`);
    const antes = await calcularBanco(tx, ctx);
    const tol = antes.dados.parametros.tolerancia_comissao;
    if (d.valor_creditado != null && Math.abs(d.valor_creditado - nfse.valor) > tol) {
      avisos.push(`o valor creditado (${brl(d.valor_creditado)}) difere do valor da NFS-e (${brl(nfse.valor)}) em ${brl(arredondar(d.valor_creditado - nfse.valor))}`);
    }
    const dataCredito = desfazer ? null : (d.data_credito ?? hoje);
    await tx`update nfse_comissao set data_credito = ${dataCredito}, data_credito_aproximada = ${!desfazer && d.aproximada === true} where id = ${nfse.id}`;

    const depois = await calcularBanco(tx, ctx);
    const x = depois.nfses.find((n) => n.id === nfse.id)!;
    const repFunil = await calcularBanco(tx, ctx, { representada_id: nfse.representada_id });
    return {
      mensagem: desfazer
        ? `Crédito da NFS-e ${x.numero ?? "s/n"} da ${nfse.representada_nome} (${brl(x.valor)}) desfeito; volta a "Aguardando pagamento".`
        : `Crédito da NFS-e ${x.numero ? `nº ${x.numero} ` : ""}da ${nfse.representada_nome} (${brl(x.valor)}, ${x.referencia ?? rotuloMes(x.competencia ?? x.data_emissao)}) registrado em ${dataBr(dataCredito)}${d.aproximada ? " (data aproximada)" : ""}. ` +
          `${x.apuracoes.length} apuração(ões) passaram a "Recebida" (NFs ${[...new Set(x.apuracoes.map((a) => a.nf.numero))].join(", ")}). ` +
          `${nfse.representada_nome}: já recebida ${brl(repFunil.funil.ja_recebida)}, a receber firme ${brl(repFunil.funil.a_receber_firme)}. Total geral já recebido: ${brl(depois.funil.ja_recebida)}.` +
          (avisos.length ? ` Avisos: ${avisos.join("; ")}.` : ""),
      nfse: {
        id: x.id,
        numero: x.numero,
        representada: nfse.representada_nome,
        valor: x.valor,
        referencia: x.referencia,
        competencia: x.competencia,
        data_emissao: x.data_emissao,
        data_credito: x.data_credito,
        data_credito_aproximada: x.data_credito_aproximada,
        status: x.status,
        dias_em_aberto: x.dias_em_aberto,
        apuracoes: x.apuracoes.map((a) => ({ nf: a.nf.numero, cliente: a.cliente.nome, valor_apurado: a.valor_apurado, situacao: a.situacao })),
      },
      totais: { representada_ja_recebida: repFunil.funil.ja_recebida, representada_a_receber_firme: repFunil.funil.a_receber_firme, geral_ja_recebida: depois.funil.ja_recebida },
      avisos,
    };
  });
}
