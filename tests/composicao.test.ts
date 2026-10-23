/**
 * Rastreabilidade: a soma dos registros listados pela Composição tem de
 * bater exatamente com o número exibido (cards, funil, matriz, consolidado,
 * faturamento). Usa a mesma fixture da planilha de tests/motor.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calcular, composicao, linhasVisiveisConsolidado } from "@/lib/motor";
import { explicacao } from "@/lib/explicacoes";
import type { PlanilhaLida } from "@/lib/importador/ler-planilha";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/planilha.json", import.meta.url), "utf8")) as PlanilhaLida;
const HOJE = "2026-10-22";
const r = calcular(fixture.dados, { hoje: HOJE });

const total = (chave: string) => {
  const c = composicao(r, chave);
  expect(c, `composição ${chave}`).not.toBeNull();
  return c!;
};

/** O que o usuário vê: o total formatado em centavos tem de ser idêntico ao número clicado. */
const centavos = (v: number) => Math.round((Math.abs(v) < 0.005 ? 0 : v) * 100);
const mesmoValorExibido = (chave: string, esperado: number) => {
  const c = total(chave);
  expect(centavos(c.total), `${chave}: ${c.total} ≠ ${esperado}`).toBe(centavos(esperado));
  return c;
};

describe("cards do Dashboard", () => {
  it("a receber (firme) = estágios 2 a 5", () => {
    const c = mesmoValorExibido("card:a_receber_firme", r.funil.a_receber_firme);
    expect(c.itens.length).toBeGreaterThan(0);
    for (const i of c.itens) expect(i.href).toMatch(/^\/(notas-fiscais|pedidos|apuracoes)\//);
  });

  it("critério da planilha (residual) inclui a Green negativa e bate com o funil", () => {
    const c = mesmoValorExibido("card:a_receber_firme_planilha", r.funil.a_receber_firme_planilha);
    const green = c.itens.find((i) => i.representada === "Green" && i.valor < 0);
    expect(green?.valor).toBeCloseTo(-111.44, 2);
  });

  it("já recebida, em previsão e total firme", () => {
    mesmoValorExibido("card:ja_recebida", r.funil.ja_recebida);
    mesmoValorExibido("card:em_previsao", r.funil.em_previsao.comissao);
    mesmoValorExibido("card:total_firme", r.funil.total_firme);
    mesmoValorExibido("pipeline", r.funil.em_previsao.comissao);
  });
});

describe("funil", () => {
  it.each([1, 2, 3, 4, 5])("estágio %i", (n) => {
    const c = mesmoValorExibido(`funil:${n}`, r.funil.estagios[n - 1].comissao);
    const tipos = new Set(c.itens.map((i) => i.tipo));
    if (n <= 3 && c.itens.length) expect(tipos).toEqual(new Set(["apuracao"]));
    if (n === 4) expect(tipos).toEqual(new Set(["nf"]));
    if (n === 5) expect(tipos).toEqual(new Set(["pedido"]));
  });
});

describe("matriz 12 meses", () => {
  it("cada célula, total firme, previsão e acumulado batem", () => {
    for (const l of r.matriz.linhas) {
      for (const rep of r.matriz.representadas) {
        mesmoValorExibido(`matriz:${l.chave}:rep:${rep.id}`, l.por_representada[rep.id]);
      }
      mesmoValorExibido(`matriz:${l.chave}:total_firme`, l.total_firme);
      mesmoValorExibido(`matriz:${l.chave}:previsao`, l.em_previsao);
      mesmoValorExibido(`matriz:${l.chave}:acumulado`, l.acumulado_firme);
    }
  });

  it("totais da matriz", () => {
    for (const rep of r.matriz.representadas) {
      mesmoValorExibido(`matriz:total:rep:${rep.id}`, r.matriz.totais.por_representada[rep.id]);
    }
    mesmoValorExibido("matriz:total:total_firme", r.matriz.totais.total_firme);
    mesmoValorExibido("matriz:total:previsao", r.matriz.totais.em_previsao);
    // A matriz distribui no tempo exatamente o card "a receber (firme)".
    expect(r.matriz.totais.total_firme).toBeCloseTo(r.funil.a_receber_firme, 2);
  });

  it("linha vencida tem itens com data anterior ao mês base", () => {
    const c = total("matriz:vencido:total_firme");
    expect(c.total).toBeGreaterThan(0);
    for (const i of c.itens) expect(i.data! < "2026-10-01").toBe(true);
  });
});

describe("consolidado", () => {
  const colunas = ["carteira", "ja_faturado", "saldo_a_faturar", "comissao_total", "comissao_apurada", "comissao_recebida", "comissao_a_receber"] as const;
  const visiveis = linhasVisiveisConsolidado(r.consolidado);

  it("cada linha × coluna", () => {
    for (const l of visiveis) {
      for (const col of colunas) {
        mesmoValorExibido(`consolidado:${l.cliente_id}:${col}`, l[col]);
      }
    }
  });

  it("totais", () => {
    for (const col of colunas) {
      const esperado = visiveis.reduce((s, l) => s + l[col], 0);
      mesmoValorExibido(`consolidado:total:${col}`, esperado);
    }
  });
});

describe("faturamento", () => {
  it("vencimentos por mês e total", () => {
    for (const v of r.faturamento.vencimentos) {
      const c = mesmoValorExibido(`faturamento:${v.mes}:valor`, v.valor);
      expect(c.itens).toHaveLength(v.parcelas);
      mesmoValorExibido(`faturamento:${v.mes}:pago`, v.valor_pago);
    }
    mesmoValorExibido("faturamento:total:valor", r.faturamento.total_vencimentos);
  });
});

describe("robustez", () => {
  it("chaves desconhecidas devolvem null", () => {
    expect(composicao(r, "nada")).toBeNull();
    expect(composicao(r, "funil:9")).toBeNull();
    expect(composicao(r, "matriz:2030-01-01:total_firme")).toBeNull();
    expect(composicao(r, "consolidado:xyz:carteira")).toBeNull();
    expect(composicao(r, "faturamento:total:outro")).toBeNull();
  });

  it("toda composição aponta para uma explicação existente", () => {
    const chaves = ["card:a_receber_firme", "card:a_receber_firme_planilha", "card:ja_recebida", "card:em_previsao", "card:total_firme", "funil:1", "funil:4", "pipeline", "matriz:vencido:total_firme", `matriz:${r.matriz.mes_base}:previsao`, "consolidado:total:carteira", "faturamento:total:valor"];
    for (const k of chaves) expect(explicacao(total(k).explicacao), k).not.toBeNull();
  });

  it("filtro por representada restringe a composição", () => {
    const green = fixture.dados.representadas.find((x) => x.nome === "Green")!;
    const rf = calcular(fixture.dados, { hoje: HOJE, filtro: { representada_id: green.id } });
    const c = composicao(rf, "card:a_receber_firme")!;
    expect(c.total).toBeCloseTo(rf.funil.a_receber_firme, 2);
    for (const i of c.itens) expect(i.representada).toBe("Green");
  });
});
