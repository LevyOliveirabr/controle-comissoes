/**
 * Busca tolerante por nome (sem banco): acentos, parcial, erro de digitação e
 * ambiguidade.
 */
import { describe, expect, it } from "vitest";
import { ErroAmbiguo, ErroNaoEncontrado, normalizar, pontuar } from "@/lib/acoes/servicos";
import { resolverUnico } from "@/lib/acoes/servicos/busca";

const nomes = [
  "Construtora Remo Ltda",
  "Luz Forte Iluminacao e Servicos Ltda",
  "CSC",
  "R C Empreendimentos e Participacoes Ltda",
  "Cliente Green - a identificar",
  "LCI Comercio",
  "EMCCAMP Urbanismo Nova Lima S/A",
  "Alegrete RJ Participacoes S/A",
  "UltraLuz",
];
const resolver = (texto: string) => resolverUnico(nomes, texto, "cliente", (n) => n, (n) => ({ id: n, rotulo: n }));

describe("normalização", () => {
  it("remove acentos, caixa e pontuação", () => {
    expect(normalizar("  Iluminação & Serviços LTDA. ")).toBe("iluminacao servicos ltda.");
  });
});

describe("pontuação", () => {
  it("igual > palavra inteira > trecho > similaridade", () => {
    expect(pontuar("Signify", "signify")).toBe(1);
    expect(pontuar("Construtora Remo Ltda", "Remo")).toBe(0.9);
    expect(pontuar("UltraLuz", "luz")).toBe(0.7);
    expect(pontuar("Signify", "Signfy")).toBeGreaterThan(0.6);
    expect(pontuar("Signify", "Maxi")).toBeLessThan(0.4);
  });
});

describe("resolução", () => {
  it("nome parcial resolve ('Remo' → Construtora Remo Ltda)", () => {
    expect(resolver("Remo")).toBe("Construtora Remo Ltda");
    expect(resolver("luz forte")).toBe("Luz Forte Iluminacao e Servicos Ltda");
    expect(resolver("emccamp")).toBe("EMCCAMP Urbanismo Nova Lima S/A");
  });

  it("prefere palavra inteira a trecho ('Luz' → Luz Forte, não UltraLuz)", () => {
    expect(resolver("Luz")).toBe("Luz Forte Iluminacao e Servicos Ltda");
  });

  it("tolera erro de digitação ('Alegrete RG')", () => {
    expect(resolver("Alegreti RJ")).toBe("Alegrete RJ Participacoes S/A");
  });

  it("devolve opções quando há empate", () => {
    expect(() => resolver("Participacoes")).toThrow(ErroAmbiguo);
    try {
      resolver("Participacoes");
    } catch (e) {
      const erro = e as ErroAmbiguo;
      expect(erro.opcoes.map((o) => o.rotulo).sort()).toEqual(["Alegrete RJ Participacoes S/A", "R C Empreendimentos e Participacoes Ltda"]);
    }
  });

  it("não chuta quando nada serve", () => {
    expect(() => resolver("Signify")).toThrow(ErroNaoEncontrado);
  });
});
