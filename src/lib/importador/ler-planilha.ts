/**
 * Lê a planilha Controle_Representacoes.xlsx e devolve os dados no formato do
 * motor (`Dados`), com ids legíveis ("rep-1", "nf-12"...). Também extrai os
 * totais calculados pela própria planilha (aba Dashboard) para conferência.
 *
 * Só lê as abas de entrada manual; tudo que é fórmula é recalculado pelo motor.
 */
import ExcelJS from "exceljs";
import { inicioMes, mesDoRotulo, normalizarData } from "../motor/datas";
import { arredondar } from "../motor/numeros";
import type {
  Apuracao,
  Cliente,
  Dados,
  NfItem,
  NfseComissao,
  NfVenda,
  Parcela,
  Pedido,
  PedidoItem,
  Representada,
  SituacaoComercial,
} from "../motor/tipos";
import { PARAMETROS_PADRAO } from "../motor/tipos";

export interface TotaisPlanilha {
  a_receber_firme: number | null;
  ja_recebida: number | null;
  em_previsao: number | null;
  funil: (number | null)[];
  total_firme: number | null;
  matriz_total_firme: number | null;
  matriz_vencido: number | null;
  mes_base: string | null;
}

export interface PlanilhaLida {
  dados: Dados;
  totais: TotaisPlanilha;
  avisos: string[];
  /** Rótulos originais para montar relatórios (chave → nome). */
  rotulos: { representadas: Record<string, string>; clientes: Record<string, string> };
}

type Celula = ExcelJS.CellValue;

function valor(c: Celula): unknown {
  if (c == null) return null;
  if (typeof c === "object") {
    if (c instanceof Date) return c;
    if ("result" in c) return valor((c as ExcelJS.CellFormulaValue).result as Celula);
    if ("richText" in c) return (c as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in c) return (c as ExcelJS.CellHyperlinkValue).text;
    if ("error" in c) return null;
  }
  return c;
}

function texto(c: Celula): string | null {
  const v = valor(c);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numero(c: Celula): number | null {
  const v = valor(c);
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function data(c: Celula): string | null {
  return normalizarData(valor(c));
}

function linhas(ws: ExcelJS.Worksheet, inicio = 4): ExcelJS.Row[] {
  const out: ExcelJS.Row[] = [];
  for (let i = inicio; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const a = texto(row.getCell(1).value);
    if (a === "TOTAL") break;
    if (!a) continue;
    out.push(row);
  }
  return out;
}

const col = (row: ExcelJS.Row, letra: string) => row.getCell(letra).value;

export async function lerPlanilha(caminho: string): Promise<PlanilhaLida> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const aba = (nome: string) => {
    const ws = wb.getWorksheet(nome);
    if (!ws) throw new Error(`Aba '${nome}' não encontrada na planilha`);
    return ws;
  };
  const avisos: string[] = [];

  // --- Representadas -------------------------------------------------------
  const representadas: Representada[] = [];
  const repPorNome = new Map<string, Representada>();
  for (const row of linhas(aba("Representadas"))) {
    const nome = texto(col(row, "A"))!;
    const obs = texto(col(row, "K"));
    const modo = (texto(col(row, "I")) ?? "Completo").toLowerCase();
    const base = texto(col(row, "D")) === "Valor dos produtos" ? "valor_produtos" : "valor_total_nf";
    const obsLower = (obs ?? "").toLowerCase();
    const r: Representada = {
      id: `rep-${representadas.length + 1}`,
      nome,
      cnpj: texto(col(row, "B")),
      pct_padrao: numero(col(row, "C")) ?? 0,
      base_calculo: base,
      po_comissao: texto(col(row, "E")),
      dias_ate_apuracao: numero(col(row, "J")) ?? 0,
      prazo_pagamento_dias: numero(col(row, "F")) ?? 30,
      email_nf: texto(col(row, "G")),
      email_copia: null,
      descricao_nf: texto(col(row, "H")),
      modo_controle: modo.startsWith("simpl") ? "simplificado" : "completo",
      envia_relatorio: true,
      regra_liberacao: /mes subsequente ao vencimento|por vencimento/.test(obsLower) ? "por_parcela" : "por_nf",
      padrao_nome_pedido: null,
      cor: null,
      ativa: true,
      observacoes: obs,
    };
    const copia = (obs ?? "").match(/copiar\s+([\w.+-]+@[\w.-]+)/i);
    if (copia) r.email_copia = copia[1];
    representadas.push(r);
    repPorNome.set(nome, r);
  }
  const rep = (nome: string | null, contexto: string): Representada => {
    const r = nome ? repPorNome.get(nome) : undefined;
    if (!r) throw new Error(`${contexto}: representada '${nome}' não cadastrada`);
    return r;
  };

  // --- Clientes ------------------------------------------------------------
  const clientes: Cliente[] = [];
  const cliPorChave = new Map<string, Cliente>();
  for (const row of linhas(aba("Clientes"))) {
    const nome = texto(col(row, "A"))!;
    const r = rep(texto(col(row, "C")), `Cliente ${nome}`);
    const c: Cliente = {
      id: `cli-${clientes.length + 1}`,
      representada_id: r.id,
      nome,
      cnpj: texto(col(row, "B")),
      codigo_externo: (texto(col(row, "D")) ?? "").match(/[Cc]odigo Signify (\d+)/)?.[1] ?? null,
      observacoes: texto(col(row, "D")),
    };
    clientes.push(c);
    cliPorChave.set(`${r.nome}|${nome}`, c);
  }
  const cli = (repNome: string | null, nome: string | null, contexto: string): Cliente => {
    const c = cliPorChave.get(`${repNome}|${nome}`);
    if (!c) throw new Error(`${contexto}: cliente '${nome}' (${repNome}) não cadastrado`);
    return c;
  };

  // --- Pedidos -------------------------------------------------------------
  const pedidos: Pedido[] = [];
  const pedPorChave = new Map<string, Pedido>();
  const situacoes: Record<string, SituacaoComercial> = {
    firme: "firme",
    previsao: "previsao",
    convertido: "convertido",
    cancelado: "cancelado",
  };
  for (const row of linhas(aba("Pedidos"))) {
    const repNome = texto(col(row, "A"));
    const cliNome = texto(col(row, "B"));
    const numeroPedido = texto(col(row, "C"))!;
    const r = rep(repNome, `Pedido ${numeroPedido}`);
    const c = cli(repNome, cliNome, `Pedido ${numeroPedido}`);
    const sit = (texto(col(row, "S")) ?? "Firme").toLowerCase();
    const obs = texto(col(row, "T"));
    const p: Pedido = {
      id: `ped-${pedidos.length + 1}`,
      representada_id: r.id,
      cliente_id: c.id,
      numero: numeroPedido,
      referencia: texto(col(row, "E")),
      data_pedido: data(col(row, "F")),
      entrega_prevista: texto(col(row, "G")),
      data_prevista_faturamento: data(col(row, "U")),
      valor_total: numero(col(row, "H")) ?? 0,
      valor_original: null,
      pct_override: numero(col(row, "I")),
      situacao_comercial: situacoes[sit] ?? "firme",
      usa_itens: false,
      observacoes: obs,
    };
    // Na planilha, a Green teve o % digitado por cima da fórmula do "% efetivo"
    // (coluna J) em vez da coluna I. Um número literal em J vale como override.
    const efetivoBruto = col(row, "J");
    if (p.pct_override == null && typeof efetivoBruto === "number" && Math.abs(efetivoBruto - r.pct_padrao) > 1e-9) {
      p.pct_override = efetivoBruto;
      avisos.push(`Pedido ${numeroPedido} (${repNome}): % efetivo digitado na coluna J (${efetivoBruto}) tratado como override do pedido.`);
    }
    // RN-04: valor original citado nas observações ("Proposta 668 de 14/10/2026 (R$ 10.065,17)").
    const original = obs?.match(/\(R\$\s*([\d.]+,\d{2})\)\.\s*Faturad/i)?.[1];
    if (original) p.valor_original = Number(original.replace(/\./g, "").replace(",", "."));
    pedidos.push(p);
    pedPorChave.set(`${repNome}|${cliNome}|${numeroPedido}`, p);
  }

  // --- Itens do pedido -----------------------------------------------------
  const pedido_itens: PedidoItem[] = [];
  for (const row of linhas(aba("Itens do Pedido"))) {
    const chave = `${texto(col(row, "A"))}|${texto(col(row, "B"))}|${texto(col(row, "C"))}`;
    const p = pedPorChave.get(chave);
    if (!p) {
      avisos.push(`Item de pedido ignorado: pedido '${chave}' não encontrado`);
      continue;
    }
    p.usa_itens = true;
    pedido_itens.push({
      id: `pit-${pedido_itens.length + 1}`,
      pedido_id: p.id,
      item: numero(col(row, "E")),
      familia: texto(col(row, "G")) ?? texto(col(row, "F")) ?? "ITEM",
      codigo: texto(col(row, "F")),
      descricao: texto(col(row, "H")),
      qtd: numero(col(row, "I")) ?? 0,
      valor_unit: numero(col(row, "J")) ?? 0,
    });
  }

  // --- Notas fiscais -------------------------------------------------------
  const nfs: NfVenda[] = [];
  const nfPorChave = new Map<string, NfVenda>();
  for (const row of linhas(aba("Notas Fiscais"))) {
    const repNome = texto(col(row, "A"));
    const cliNome = texto(col(row, "B"));
    const pedNumero = texto(col(row, "C"));
    const numeroNf = texto(col(row, "E"))!;
    const r = rep(repNome, `NF ${numeroNf}`);
    const c = cli(repNome, cliNome, `NF ${numeroNf}`);
    const p = pedNumero ? pedPorChave.get(`${repNome}|${cliNome}|${pedNumero}`) : undefined;
    if (pedNumero && !p) avisos.push(`NF ${numeroNf}: pedido '${pedNumero}' não encontrado; importada sem pedido`);
    const obs = texto(col(row, "T"));
    const chaveAcesso = obs?.match(/[Cc]have(?: de acesso)?\s+((?:\d{4}\s*){11})/)?.[1]?.replace(/\s+/g, "") ?? null;
    const nf: NfVenda = {
      id: `nf-${nfs.length + 1}`,
      representada_id: r.id,
      cliente_id: c.id,
      pedido_id: p?.id ?? null,
      numero: numeroNf,
      serie: "1",
      chave_acesso: chaveAcesso && chaveAcesso.length === 44 ? chaveAcesso : null,
      data_emissao: data(col(row, "G")) ?? "1970-01-01",
      valor_produtos: numero(col(row, "H")) ?? 0,
      valor_total: numero(col(row, "I")) ?? 0,
      pct_override: numero(col(row, "U")),
      simulada: /^SIM/i.test(numeroNf) || /NOTA SIMULADA/i.test(obs ?? ""),
      venda_direta: !p && r.modo_controle !== "simplificado",
      observacoes: obs,
    };
    nfs.push(nf);
    nfPorChave.set(`${repNome}|${cliNome}|${numeroNf}`, nf);
  }
  const nfDaLinha = (row: ExcelJS.Row, colNf: string, contexto: string): NfVenda | null => {
    const chave = `${texto(col(row, "A"))}|${texto(col(row, "B"))}|${texto(col(row, colNf))}`;
    const nf = nfPorChave.get(chave);
    if (!nf) avisos.push(`${contexto}: NF '${chave}' não encontrada; linha ignorada`);
    return nf ?? null;
  };

  // --- Itens faturados -----------------------------------------------------
  const nf_itens: NfItem[] = [];
  for (const row of linhas(aba("Itens Faturados"))) {
    const nf = nfDaLinha(row, "E", "Item faturado");
    if (!nf) continue;
    nf_itens.push({
      id: `nit-${nf_itens.length + 1}`,
      nf_venda_id: nf.id,
      familia: texto(col(row, "G")) ?? "ITEM",
      codigo: texto(col(row, "J")),
      qtd: numero(col(row, "H")) ?? 0,
      valor_total: numero(col(row, "I")) ?? 0,
      observacoes: texto(col(row, "K")),
    });
  }

  // --- Parcelas ------------------------------------------------------------
  const parcelas: Parcela[] = [];
  for (const row of linhas(aba("Parcelas"))) {
    const nf = nfDaLinha(row, "C", "Parcela");
    if (!nf) continue;
    parcelas.push({
      id: `par-${parcelas.length + 1}`,
      nf_venda_id: nf.id,
      numero: numero(col(row, "E")) ?? parcelas.filter((p) => p.nf_venda_id === nf.id).length + 1,
      vencimento_documento: data(col(row, "F")) ?? nf.data_emissao,
      vencimento_boleto: data(col(row, "G")),
      valor: numero(col(row, "H")) ?? 0,
      cliente_pagou: (texto(col(row, "I")) ?? "").toUpperCase() === "SIM",
      data_pagamento: data(col(row, "J")),
      observacoes: texto(col(row, "L")),
    });
  }

  // --- NFS-e de comissão ---------------------------------------------------
  const nfses: NfseComissao[] = [];
  const nfsePorChaveMes = new Map<string, NfseComissao>();
  for (const row of linhas(aba("NF Comissao"))) {
    const repNome = texto(col(row, "A"));
    const r = rep(repNome, "NFS-e");
    const rotulo = texto(col(row, "D"));
    const obs = texto(col(row, "L"));
    const emissao = data(col(row, "C")) ?? "1970-01-01";
    const x: NfseComissao = {
      id: `nfse-${nfses.length + 1}`,
      representada_id: r.id,
      numero: texto(col(row, "B")),
      chave_acesso: obs?.match(/[Cc]have\s+(\d{40,60})/)?.[1] ?? null,
      data_emissao: emissao,
      competencia: mesDoRotulo(rotulo) ?? inicioMes(emissao),
      referencia: rotulo,
      valor: numero(col(row, "F")) ?? 0,
      enviada_em: obs?.match(/[Ee]nviada em (\d{2}\/\d{2}\/\d{4})/) ? normalizarData(obs.match(/[Ee]nviada em (\d{2}\/\d{2}\/\d{4})/)![1]) : null,
      data_credito: data(col(row, "H")),
      data_credito_aproximada: /data exata (do credito )?nao informada|sem data exata/i.test(obs ?? ""),
      observacoes: obs,
    };
    nfses.push(x);
    if (rotulo) nfsePorChaveMes.set(`${repNome}|${rotulo}`, x);
  }

  // --- Apurações (Relatorios Comissao) -------------------------------------
  const apuracoes: Apuracao[] = [];
  const parcelasUsadas = new Set<string>();
  const representadasSemRelatorio = new Set<string>();
  for (const row of linhas(aba("Relatorios Comissao"))) {
    const nf = nfDaLinha(row, "C", "Apuração");
    if (!nf) continue;
    const repNome = texto(col(row, "A"));
    const r = rep(repNome, "Apuração");
    const rotulo = texto(col(row, "E"));
    const obs = texto(col(row, "O"));
    const base = numero(col(row, "I")) ?? 0;
    const nfse = rotulo ? nfsePorChaveMes.get(`${repNome}|${rotulo}`) ?? null : null;
    if (rotulo && !nfse && texto(col(row, "L")) !== "NF de comissao nao emitida") {
      avisos.push(`Apuração NF ${nf.numero} '${rotulo}': NFS-e correspondente não encontrada`);
    }
    if (/nao envia relatorio/i.test(obs ?? "")) representadasSemRelatorio.add(r.id);

    // Apuração por parcela: casa a base com o valor de uma parcela ainda não usada da NF.
    const parcela = parcelas.find(
      (p) => p.nf_venda_id === nf.id && !parcelasUsadas.has(p.id) && arredondar(p.valor - base) === 0,
    );
    const parcelasDaNf = parcelas.filter((p) => p.nf_venda_id === nf.id);
    const parcelaId = parcela && parcelasDaNf.length > 1 ? parcela.id : null;
    if (parcelaId) parcelasUsadas.add(parcelaId);

    const mes =
      mesDoRotulo(rotulo) ??
      (nfse ? inicioMes(nfse.data_emissao) : null) ??
      (data(col(row, "G")) ? inicioMes(data(col(row, "G"))!) : null) ??
      inicioMes(nf.data_emissao);

    apuracoes.push({
      id: `apu-${apuracoes.length + 1}`,
      representada_id: r.id,
      nf_venda_id: nf.id,
      parcela_id: parcelaId,
      nfse_id: nfse?.id ?? null,
      mes_referencia: mes,
      referencia: rotulo,
      data_pgto_representada: data(col(row, "G")),
      nr_pgto: texto(col(row, "H")),
      base,
      pct: numero(col(row, "J")) ?? 0,
      valor_apurado: numero(col(row, "K")) ?? 0,
      origem: "relatorio_representada",
      observacoes: obs,
    });
  }
  for (const r of representadas) {
    if (representadasSemRelatorio.has(r.id)) {
      r.envia_relatorio = false;
      for (const a of apuracoes) if (a.representada_id === r.id) a.origem = "nfse_propria";
    }
  }

  // --- Parâmetros ----------------------------------------------------------
  const parametros = { ...PARAMETROS_PADRAO };
  for (const row of linhas(aba("Parametros"))) {
    const nome = (texto(col(row, "A")) ?? "").toLowerCase();
    const v = numero(col(row, "B"));
    if (v == null) continue;
    if (nome.startsWith("tolerancia de saldo")) parametros.tolerancia_saldo = v;
    if (nome.startsWith("tolerancia de comissao")) parametros.tolerancia_comissao = v;
  }

  // --- Totais calculados pela planilha (para conferência) ------------------
  const dash = aba("Dashboard");
  const n = (ref: string) => numero(dash.getCell(ref).value);
  const totais: TotaisPlanilha = {
    a_receber_firme: n("C5"),
    ja_recebida: n("F5"),
    em_previsao: n("I5"),
    funil: ["E10", "E11", "E12", "E13", "E14"].map(n),
    total_firme: n("E15"),
    matriz_total_firme: n("I38"),
    matriz_vencido: n("I23"),
    mes_base: data(dash.getCell("H21").value),
  };

  return {
    dados: { representadas, clientes, pedidos, pedido_itens, nfs, nf_itens, parcelas, apuracoes, nfses, parametros },
    totais,
    avisos,
    rotulos: {
      representadas: Object.fromEntries(representadas.map((r) => [r.id, r.nome])),
      clientes: Object.fromEntries(clientes.map((c) => [c.id, c.nome])),
    },
  };
}
