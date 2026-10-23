/**
 * Ponta a ponta: sobe o manipulador da rota /api/mcp num servidor HTTP local e
 * conversa com ele por um cliente MCP de verdade (Streamable HTTP + Bearer).
 */
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarManipuladorMcp } from "@/lib/mcp/servidor";
import { NOMES_DAS_FERRAMENTAS } from "@/lib/mcp/ferramentas";
import { carregarFixture, conectarBancoDeTeste, HOJE_FIXTURE, TEM_BANCO } from "./apoio/banco";
import { subirServidor } from "./apoio/http";

const TOKEN = "token-de-teste-123";

type Conteudo = { type: string; text?: string }[];
const textoDe = (r: { content?: unknown }) => ((r.content ?? []) as Conteudo).map((c) => c.text ?? "").join("\n");

describe.skipIf(!TEM_BANCO)("servidor MCP (HTTP)", () => {
  let db: Sql;
  let url: string;
  let fechar: () => Promise<void>;
  let cliente: Client;

  beforeAll(async () => {
    db = await conectarBancoDeTeste();
    await carregarFixture(db);
    const manipulador = criarManipuladorMcp({
      contexto: { usuario: "bot", db, hoje: HOJE_FIXTURE },
      obterToken: () => TOKEN,
    });
    ({ url, fechar } = await subirServidor(manipulador));
    cliente = new Client({ name: "teste", version: "0.0.1" });
    await cliente.connect(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }),
    );
  });

  afterAll(async () => {
    await cliente?.close();
    await fechar?.();
    await db?.end();
  });

  it("recusa sem token (401) e com token errado", async () => {
    const corpo = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const cab = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const sem = await fetch(url, { method: "POST", body: corpo, headers: cab });
    expect(sem.status).toBe(401);
    expect(sem.headers.get("www-authenticate")).toMatch(/Bearer/);
    const errado = await fetch(url, { method: "POST", body: corpo, headers: { ...cab, authorization: "Bearer outro" } });
    expect(errado.status).toBe(401);
  });

  it("responde 503 quando MCP_TOKEN não está configurado", async () => {
    const desligado = await subirServidor(criarManipuladorMcp({ contexto: { usuario: "bot", db }, obterToken: () => undefined }));
    try {
      const r = await fetch(desligado.url, { method: "POST", body: "{}", headers: { "content-type": "application/json", authorization: "Bearer x" } });
      expect(r.status).toBe(503);
    } finally {
      await desligado.fechar();
    }
  });

  it("lista as ferramentas em português com descrições e esquemas", async () => {
    expect(cliente.getServerVersion()?.name).toBe("controle-comissoes");
    expect(cliente.getInstructions()).toContain("representada");
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NOMES_DAS_FERRAMENTAS].sort());
    const criar = tools.find((t) => t.name === "criar_pedido")!;
    expect(criar.description).toContain("tirei um pedido");
    const props = (criar.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["representada", "cliente", "valor_total", "data_prevista_faturamento"]));
    expect(props.valor_total.description).toContain("85000");
  });

  it("criar_pedido: 'tirei um pedido da Signify pra Remo, 85 mil, entrega em dezembro'", async () => {
    const r = await cliente.callTool({
      name: "criar_pedido",
      arguments: { representada: "Signify", cliente: "Remo", valor_total: 85000, data_prevista_faturamento: "2026-12" },
    });
    expect(r.isError).toBeFalsy();
    const texto = textoDe(r);
    expect(texto).toContain("Pedido 07 - Outubro");
    expect(texto).toContain("R$ 3.400,00");
    const dados = r.structuredContent as { pedido: { id: string; cliente: { nome: string }; comissao_prevista: number } };
    expect(dados.pedido.cliente.nome).toBe("Construtora Remo Ltda");
    expect(dados.pedido.comissao_prevista).toBe(3400);

    const [aud] = await db`select usuario from auditoria where tabela = 'pedido' and registro_id = ${dados.pedido.id}`;
    expect(aud.usuario).toBe("bot");
  });

  it("ambiguidade volta como opções, não como erro nem chute", async () => {
    const r = await cliente.callTool({ name: "lancar_nf", arguments: { representada: "Signify", cliente: "Remo", numero: "600", valor_total: 50000 } });
    expect(r.isError).toBeFalsy();
    const dados = r.structuredContent as { ambiguo: boolean; opcoes: { rotulo: string }[] };
    expect(dados.ambiguo).toBe(true);
    expect(dados.opcoes.map((o) => o.rotulo).sort()).toEqual(["Pedido 06 - Dezembro", "Pedido 07 - Outubro"]);
    expect(textoDe(r)).toContain("Opções encontradas");
  });

  it("lancar_nf: 'chegou a NF 926 da VW pra Luz Forte, R$ 10.288,03, 3 parcelas' (venda direta)", async () => {
    const r = await cliente.callTool({
      name: "lancar_nf",
      arguments: { representada: "VW", cliente: "Luz Forte", numero: "926", valor_total: 10288.03, parcelas: 3, venda_direta: true },
    });
    expect(r.isError).toBeFalsy();
    const dados = r.structuredContent as { nf: { parcelas: { vencimento: string; valor: number }[]; comissao_prevista: number; pedido: unknown } };
    expect(dados.nf.pedido).toBeNull();
    expect(dados.nf.parcelas).toHaveLength(3);
    expect(dados.nf.parcelas[0].vencimento).toBe("2026-11-21");
    expect(dados.nf.comissao_prevista).toBeCloseTo(720.16, 2);
    expect(textoDe(r)).toContain("NF 926 da VW Experience");
  });

  it("erros de validação e de negócio voltam como isError com mensagem clara", async () => {
    const dup = await cliente.callTool({ name: "lancar_nf", arguments: { representada: "VW", cliente: "Luz Forte", numero: "926", valor_total: 1 } });
    expect(dup.isError).toBe(true);
    expect(textoDe(dup)).toMatch(/já está lançada/);

    const naoExiste = await cliente.callTool({ name: "criar_pedido", arguments: { representada: "Philips", cliente: "Remo", valor_total: 10 } });
    expect(naoExiste.isError).toBe(true);
    expect(textoDe(naoExiste)).toMatch(/Não encontrei representada/);

    const invalido = await cliente.callTool({ name: "criar_pedido", arguments: { representada: "Signify", cliente: "Remo", valor_total: -5 } });
    expect(invalido.isError).toBe(true);
  });

  it("consultar_resumo reflete o que foi lançado", async () => {
    const r = await cliente.callTool({ name: "consultar_resumo", arguments: {} });
    expect(r.isError).toBeFalsy();
    const dados = r.structuredContent as { cards: { a_receber_firme: number; ja_recebida: number }; funil: unknown[] };
    expect(dados.cards.ja_recebida).toBeCloseTo(167018.64, 2);
    expect(dados.cards.a_receber_firme).toBeCloseTo(104363.29 + 3400 + 720.16, 2);
    expect(dados.funil).toHaveLength(5);
    expect(textoDe(r)).toContain("R$");

    const signify = await cliente.callTool({ name: "consultar_resumo", arguments: { representada: "signfy" } });
    expect(textoDe(signify)).toContain("Signify");
  });

  it("registrar_credito_nfse: 'recebi a comissão da Signify de setembro, caiu hoje'", async () => {
    const r = await cliente.callTool({ name: "registrar_credito_nfse", arguments: { representada: "Signify", competencia: "2026-09" } });
    expect(r.isError).toBeFalsy();
    const dados = r.structuredContent as { nfse: { numero: string; data_credito: string } };
    expect(dados.nfse.numero).toBe("10");
    expect(dados.nfse.data_credito).toBe(HOJE_FIXTURE);
  });
});
