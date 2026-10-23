/**
 * Testes do motor contra a planilha original (fixture gerada por
 * scripts/gerar-fixture.ts). Os valores esperados vêm da própria planilha
 * (aba Dashboard / Agenda / Matriz), calculada em 22/10/2026.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calcular, type Dados } from "@/lib/motor";
import type { PlanilhaLida } from "@/lib/importador/ler-planilha";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/planilha.json", import.meta.url), "utf8")) as PlanilhaLida;
const HOJE = "2026-10-22";

const clonar = (d: Dados): Dados => structuredClone(d);
const resultado = calcular(fixture.dados, { hoje: HOJE });
const porNumero = (numero: string) => resultado.nfs.find((n) => n.numero === numero)!;
const porPedido = (numero: string) => resultado.pedidos.find((p) => p.numero === numero)!;

describe("leitura da planilha", () => {
  it("carrega todas as abas", () => {
    const d = fixture.dados;
    expect(d.representadas).toHaveLength(6);
    expect(d.clientes).toHaveLength(9);
    expect(d.pedidos).toHaveLength(18);
    expect(d.nfs).toHaveLength(24);
    expect(d.nf_itens).toHaveLength(33);
    expect(d.parcelas).toHaveLength(33);
    expect(d.apuracoes).toHaveLength(25);
    expect(d.nfses).toHaveLength(8);
  });

  it("deduz flags das observações", () => {
    const rep = (nome: string) => fixture.dados.representadas.find((r) => r.nome === nome)!;
    expect(rep("F-Led").regra_liberacao).toBe("por_parcela");
    expect(rep("Maxi Ferramentas").modo_controle).toBe("simplificado");
    expect(rep("VW Experience").dias_ate_apuracao).toBe(0);
    expect(fixture.dados.pedidos.find((p) => p.numero === "Venda 01 - Energia")!.pct_override).toBeCloseTo(0.0229, 6);
    expect(fixture.dados.pedidos.find((p) => p.numero === "PV 668")!.valor_original).toBeCloseTo(10065.17, 2);
  });
});

describe("Dashboard (funil e cards)", () => {
  const t = fixture.totais;

  it("comissão já recebida", () => {
    expect(resultado.funil.ja_recebida).toBeCloseTo(t.ja_recebida!, 2);
  });

  it("funil estágios 1, 2, 3 e 5", () => {
    const e = resultado.funil.estagios;
    expect(e[0].comissao).toBeCloseTo(t.funil[0]!, 2);
    expect(e[1].comissao).toBeCloseTo(t.funil[1]!, 2);
    expect(e[2].comissao).toBe(0);
    expect(e[4].comissao).toBeCloseTo(t.funil[4]!, 4);
  });

  it("estágio 4: nota a nota x residual da planilha", () => {
    expect(resultado.funil.estagio4_residual).toBeCloseTo(t.funil[3]!, 2);
    expect(resultado.funil.estagios[3].comissao).toBeCloseTo(25963.76, 2);
    // A diferença é exatamente a divergência da Green (apurada > prevista).
    expect(resultado.funil.divergencia.total).toBeCloseTo(111.44, 2);
    expect(resultado.funil.divergencia.nfs.map((n) => n.numero)).toEqual(["SIM-0001"]);
  });

  it("a receber firme: card da planilha (residual) e matriz (nota a nota)", () => {
    expect(resultado.funil.a_receber_firme_planilha).toBeCloseTo(t.a_receber_firme!, 2);
    expect(resultado.funil.a_receber_firme).toBeCloseTo(t.matriz_total_firme!, 2);
    expect(resultado.matriz.totais.total_firme).toBeCloseTo(resultado.funil.a_receber_firme, 6);
  });

  it("em previsão", () => {
    expect(resultado.funil.em_previsao.comissao).toBeCloseTo(t.em_previsao!, 2);
  });

  it("filtro por representada vale para todas as visões", () => {
    const signify = fixture.dados.representadas.find((r) => r.nome === "Signify")!;
    const r = calcular(fixture.dados, { hoje: HOJE, filtro: { representada_id: signify.id } });
    expect(r.funil.a_receber_firme).toBeCloseTo(58914.98, 2);
    expect(r.matriz.totais.total_firme).toBeCloseTo(58914.98, 2);
    expect(r.agenda.every((i) => i.representada_id === signify.id)).toBe(true);
  });
});

describe("Agenda de recebimentos", () => {
  const item = (descricao: string) => resultado.agenda.find((i) => i.descricao.includes(descricao))!;

  it("bloco 1 - NFS-e emitidas", () => {
    expect(item("SIM-C002")).toMatchObject({ data_esperada: "2026-09-24", vencido: true });
    expect(item("SIM-C002").valor).toBeCloseTo(33355.68, 2);
    expect(item("NFS-e 10")).toMatchObject({ data_esperada: "2026-10-26", vencido: false });
    expect(item("NFS-e 10").valor).toBeCloseTo(25375.57, 2);
  });

  it("bloco 2 - NFs faturadas sem apuração (emissão + dias + prazo)", () => {
    expect(item("136290").data_esperada).toBe("2026-10-03");
    expect(item("136290").valor).toBeCloseTo(1190.82, 2);
    expect(item("NF de venda 907").data_esperada).toBe("2026-10-29"); // VW: 0 dias + 30
    expect(item("NF de venda 534").data_esperada).toBe("2026-11-01");
    expect(item("NF de venda 561").data_esperada).toBe("2026-11-18");
    expect(item("NF de venda 562").data_esperada).toBe("2026-11-18");
    expect(item("NF de venda 925").data_esperada).toBe("2026-11-14");
  });

  it("bloco 4 - pedidos firmes a faturar", () => {
    expect(item("Pedido 01 - Setembro")).toMatchObject({ data_esperada: "2027-01-02" });
    expect(item("Pedido 01 - Setembro").valor).toBeCloseTo(9214.8, 2);
    expect(item("OC 004323")).toMatchObject({ data_esperada: "2027-01-26" });
    expect(item("OC 004323").valor).toBeCloseTo(7108.0836, 4);
    expect(item("Venda 01 - Outubro")).toMatchObject({ data_esperada: "2026-11-04" });
  });

  it("previsão entra separada", () => {
    expect(item("Pedido 06")).toMatchObject({ confianca: "Previsao", data_esperada: "2027-03-03" });
    expect(item("Pedido 06").valor).toBeCloseTo(45468, 2);
  });

  it("não lista o que já foi recebido nem pedidos cancelados", () => {
    expect(resultado.agenda.some((i) => i.descricao.includes("Jul/2026"))).toBe(false);
    expect(resultado.agenda.some((i) => i.cliente === "LCI Comercio")).toBe(false);
  });
});

describe("Matriz 12 meses", () => {
  const linha = (rotuloOuMes: string) => resultado.matriz.linhas.find((l) => l.mes === rotuloOuMes || l.tipo === rotuloOuMes)!;
  const rep = (nome: string) => fixture.dados.representadas.find((r) => r.nome === nome)!.id;

  it("vencido", () => {
    expect(linha("vencido").total_firme).toBeCloseTo(fixture.totais.matriz_vencido!, 2);
    expect(linha("vencido").por_representada[rep("Green")]).toBeCloseTo(33355.68, 2);
  });

  it("meses", () => {
    expect(linha("2026-10-01").por_representada[rep("Signify")]).toBeCloseTo(26566.39, 2);
    expect(linha("2026-10-01").por_representada[rep("VW Experience")]).toBeCloseTo(918.99, 2);
    expect(linha("2026-11-01").por_representada[rep("Signify")]).toBeCloseTo(23133.79, 2);
    expect(linha("2026-11-01").por_representada[rep("VW Experience")]).toBeCloseTo(720.16, 2);
    expect(linha("2026-11-01").por_representada[rep("Empresa Oportunidade")]).toBeCloseTo(3345.4, 2);
    expect(linha("2027-01-01").por_representada[rep("Signify")]).toBeCloseTo(9214.8, 2);
    expect(linha("2027-01-01").por_representada[rep("F-Led")]).toBeCloseTo(7108.0836, 4);
    expect(linha("2027-03-01").em_previsao).toBeCloseTo(45468, 2);
  });

  it("acumulado fecha com o total firme", () => {
    const ultima = resultado.matriz.linhas.at(-1)!;
    expect(ultima.acumulado_firme).toBeCloseTo(resultado.matriz.totais.total_firme, 6);
  });
});

describe("Notas fiscais", () => {
  it("hierarquia de percentual", () => {
    expect(porNumero("402").pct).toBe(0.04); // padrão da representada
    expect(porNumero("SIM-0001").pct).toBe(0.0229); // override do pedido
    const dados = clonar(fixture.dados);
    dados.nfs.find((n) => n.numero === "402")!.pct_override = 0.05;
    expect(calcular(dados, { hoje: HOJE }).nfs.find((n) => n.numero === "402")!.pct).toBe(0.05);
  });

  it("status da comissão com tolerância", () => {
    expect(porNumero("402").status_planilha).toBe("Comissao recebida"); // saldo 0,0056
    expect(porNumero("402").status).toBe("recebida");
    expect(porNumero("500").status_planilha).toBe("Apurada - aguardando pgto");
    expect(porNumero("500").status).toBe("nfse_emitida");
    expect(porNumero("534").status_planilha).toBe("Nao apurada ainda");
    expect(porNumero("534").status).toBe("nao_apurada");
  });

  it("apurada sem NFS-e fica em 'aguardando NFS-e' (estágio 3)", () => {
    const dados = clonar(fixture.dados);
    for (const a of dados.apuracoes.filter((x) => x.nfse_id === "nfse-7")) a.nfse_id = null;
    const r = calcular(dados, { hoje: HOJE });
    expect(r.nfs.find((n) => n.numero === "500")!.status).toBe("apurada_aguardando_nfse");
    expect(r.funil.estagios[2].comissao).toBeCloseTo(25375.57, 2);
    expect(r.funil.estagios[1].comissao).toBeCloseTo(58731.25 - 25375.57, 2);
  });

  it("confere itens", () => {
    expect(porNumero("402").confere_itens).toBe("OK");
    expect(porNumero("925").confere_itens).toBe("Sem itens - simplificado");
  });
});

describe("Pedidos", () => {
  it("saldo e situação com tolerância de R$ 100", () => {
    const p = porPedido("Pedido 01 - Abril");
    expect(p.ja_faturado).toBeCloseTo(1136699.78, 2);
    expect(p.saldo_a_faturar).toBe(0);
    expect(p.situacao_faturamento).toBe("Faturado integralmente");
    expect(p.variacao_preco).toBeCloseTo(0.22, 2);
  });

  it("pedido sem itens usa valor total − faturado", () => {
    const p = resultado.pedidos.find((x) => x.numero === "Pedido 01 - Setembro" && x.cliente.nome.startsWith("EMCCAMP"))!;
    expect(p.usa_itens).toBe(false);
    expect(p.saldo_a_faturar).toBe(230370);
    expect(p.comissao_saldo).toBeCloseTo(9214.8, 2);
  });

  it("cancelado e previsão", () => {
    const cancelado = resultado.pedidos.find((p) => p.situacao_comercial === "cancelado")!;
    expect(cancelado.ativo).toBe(false);
    expect(cancelado.comissao_total).toBe(0);
    expect(porPedido("Pedido 06 - Dezembro").situacao_comercial).toBe("previsao");
  });

  it("parcialmente faturado", () => {
    const dados = clonar(fixture.dados);
    const nf404 = dados.nfs.find((n) => n.numero === "404")!;
    dados.nfs = dados.nfs.filter((n) => n.id !== nf404.id);
    dados.nf_itens = dados.nf_itens.filter((i) => i.nf_venda_id !== nf404.id);
    dados.parcelas = dados.parcelas.filter((i) => i.nf_venda_id !== nf404.id);
    dados.apuracoes = dados.apuracoes.filter((i) => i.nf_venda_id !== nf404.id);
    const r = calcular(dados, { hoje: HOJE });
    const p = r.pedidos.find((x) => x.numero === "Pedido 01 - Abril")!;
    expect(p.situacao_faturamento).toBe("Faturado parcialmente");
    expect(p.saldo_a_faturar).toBeGreaterThan(0);
  });
});

describe("NFS-e de comissão", () => {
  const nfse = (numero: string) => resultado.nfses.find((n) => n.numero === numero)!;

  it("previsão de crédito e status", () => {
    expect(nfse("10")).toMatchObject({ previsao_credito: "2026-10-26", status: "Aguardando pagamento" });
    expect(nfse("SIM-C002")).toMatchObject({ previsao_credito: "2026-09-24", status: "Aguardando pagamento" });
    expect(nfse("8").status).toBe("Recebida");
  });

  it("checklist antes de enviar (RN-20)", () => {
    expect(nfse("10").checklist.completo).toBe(true);
    expect(nfse("7").checklist.po.ok).toBe(false);
  });

  it("valor da NFS-e bate com as apurações cobertas", () => {
    expect(nfse("10").soma_apuracoes).toBeCloseTo(25375.57, 2);
    expect(nfse("10").alerta_valor).toBe(false);
  });
});

describe("Casos reais", () => {
  it("Signify: apuração por parcela (NF 402 tem 3 parcelas e 3 apurações)", () => {
    const nf = porNumero("402");
    expect(nf.n_parcelas).toBe(3);
    expect(nf.apuracoes).toHaveLength(3);
    expect(nf.apuracoes.every((a) => a.parcela_id)).toBe(true);
    expect(nf.apuracoes.map((a) => a.parcela!.valor)).toEqual([89441.02, 89467.85, 89441.02]);
    expect(nf.comissao_apurada).toBeCloseTo(10733.99, 2);
  });

  it("Green: % override 2,29% x apurado 2,97% (divergência +111,44)", () => {
    const nf = porNumero("SIM-0001");
    expect(nf.comissao_prevista).toBeCloseTo(49168.56, 2);
    expect(nf.comissao_apurada).toBeCloseTo(49280, 2);
    expect(nf.divergencia).toBeCloseTo(111.44, 2);
    expect(nf.pendente_apuracao).toBe(0);
  });

  it("VW: dias até apuração 0 → comissão esperada 30 dias após a emissão", () => {
    const nf = porNumero("907");
    expect(nf.representada.dias_ate_apuracao).toBe(0);
    expect(resultado.agenda.find((i) => i.referencia.id === nf.id)!.data_esperada).toBe("2026-10-29");
  });

  it("Maxi: modo simplificado aceita NF sem pedido", () => {
    const dados = clonar(fixture.dados);
    const maxi = dados.representadas.find((r) => r.nome === "Maxi Ferramentas")!;
    dados.clientes.push({ id: "cli-maxi", representada_id: maxi.id, nome: "Cliente Maxi", cnpj: null, codigo_externo: null, observacoes: null });
    dados.nfs.push({
      id: "nf-maxi",
      representada_id: maxi.id,
      cliente_id: "cli-maxi",
      pedido_id: null,
      numero: "1001",
      serie: "1",
      chave_acesso: null,
      data_emissao: "2026-10-10",
      valor_produtos: 10000,
      valor_total: 10500,
      pct_override: null,
      simulada: false,
      venda_direta: false,
      observacoes: null,
    });
    const r = calcular(dados, { hoje: HOJE });
    const nf = r.nfs.find((n) => n.id === "nf-maxi")!;
    expect(nf.pedido).toBeNull();
    expect(nf.pct).toBe(0.08);
    expect(nf.comissao_prevista).toBeCloseTo(840, 2);
    expect(nf.confere_itens).toBe("Sem itens - simplificado");
    // Maxi: 0 dias + 30 de prazo
    expect(r.agenda.find((i) => i.referencia.id === "nf-maxi")!.data_esperada).toBe("2026-11-09");
    expect(r.funil.a_receber_firme).toBeCloseTo(resultado.funil.a_receber_firme + 840, 2);
  });

  it("F-Led: pedido a faturar entra em Jan/2027 (28/10 + 30 + 60)", () => {
    const p = porPedido("OC 004323");
    expect(p.pct_efetivo).toBe(0.02);
    expect(p.comissao_saldo).toBeCloseTo(7108.0836, 4);
    expect(resultado.agenda.find((i) => i.referencia.id === p.id)!.data_esperada).toBe("2027-01-26");
  });

  it("F-Led: quando faturar, a comissão é liberada parcela a parcela (mês seguinte ao vencimento)", () => {
    const dados = clonar(fixture.dados);
    const p = dados.pedidos.find((x) => x.numero === "OC 004323")!;
    dados.nfs.push({
      id: "nf-fled",
      representada_id: p.representada_id,
      cliente_id: p.cliente_id,
      pedido_id: p.id,
      numero: "77",
      serie: "1",
      chave_acesso: null,
      data_emissao: "2026-10-28",
      valor_produtos: 355404.18,
      valor_total: 355404.18,
      pct_override: null,
      simulada: false,
      venda_direta: false,
      observacoes: null,
    });
    dados.nf_itens.push({ id: "nit-fled", nf_venda_id: "nf-fled", familia: "120W", codigo: "LUM.LED.PUBL-252", qtd: 838, valor_total: 355404.18, observacoes: null });
    dados.parcelas.push(
      { id: "par-f1", nf_venda_id: "nf-fled", numero: 1, vencimento_documento: "2026-11-27", vencimento_boleto: null, valor: 177702.09, cliente_pagou: false, data_pagamento: null, observacoes: null },
      { id: "par-f2", nf_venda_id: "nf-fled", numero: 2, vencimento_documento: "2026-12-27", vencimento_boleto: null, valor: 177702.09, cliente_pagou: false, data_pagamento: null, observacoes: null },
    );
    const r = calcular(dados, { hoje: HOJE });
    const itens = r.agenda.filter((i) => i.referencia.id === "nf-fled");
    expect(itens).toHaveLength(2);
    expect(itens.map((i) => i.data_esperada)).toEqual(["2026-12-27", "2027-01-27"]);
    expect(itens[0].valor + itens[1].valor).toBeCloseTo(7108.08, 2);
    // O pedido saiu da agenda (faturado integralmente).
    expect(r.agenda.some((i) => i.referencia.id === p.id)).toBe(false);
  });
});
