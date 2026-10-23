/**
 * Serviços de negócio contra um Postgres real (DATABASE_URL_TESTE) carregado
 * com a fixture da planilha. Os testes rodam em sequência e vão mudando o
 * estado, como o bot faria ao longo de um dia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  atualizarPedido,
  buscarCliente,
  buscarRepresentada,
  consultarPendencias,
  consultarResumo,
  criarCliente,
  criarPedido,
  emitirNfse,
  ErroAmbiguo,
  ErroNaoEncontrado,
  ErroValidacao,
  lancarNf,
  listarNfsSemApuracao,
  listarPedidosEmAberto,
  registrarApuracao,
  registrarCreditoNfse,
  registrarParcelaPaga,
  resolverCliente,
  type Contexto,
} from "@/lib/acoes/servicos";
import { carregarFixture, conectarBancoDeTeste, HOJE_FIXTURE, TEM_BANCO } from "./apoio/banco";

const perto = (v: number) => expect.closeTo(v, 2);
/** Espera que a promessa rejeite e devolve o erro já tipado. */
const capturar = <E>(p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("deveria ter falhado");
    },
    (e) => e as E,
  );

describe.skipIf(!TEM_BANCO)("serviços do bot (Postgres)", () => {
  let db: Sql;
  let ctx: Contexto;

  beforeAll(async () => {
    db = await conectarBancoDeTeste();
    await carregarFixture(db);
    ctx = { usuario: "teste-bot", db, hoje: HOJE_FIXTURE };
  });
  afterAll(async () => {
    await db?.end();
  });

  it("estado inicial bate com a planilha", async () => {
    const r = await consultarResumo({}, ctx);
    expect(r.cards.ja_recebida).toEqual(perto(167018.64));
    expect(r.cards.a_receber_firme).toEqual(perto(104363.29));
    expect(r.cards.a_receber_firme_criterio_planilha).toEqual(perto(104251.89));
    expect(r.cards.em_previsao.comissao).toEqual(perto(45468));
    expect(r.cards.vencido).toEqual(perto(33355.68));
    expect(r.funil).toHaveLength(5);
    expect(r.mensagem).toContain("R$ 104.363,29");
  });

  describe("busca tolerante", () => {
    it("representada por nome aproximado", async () => {
      const r = await buscarRepresentada({ texto: "Signfy" }, ctx);
      expect(r.representadas[0].nome).toBe("Signify");
      expect(r.representadas[0].clientes).toContain("Construtora Remo Ltda");
      const todas = await buscarRepresentada({}, ctx);
      expect(todas.total).toBe(6);
    });

    it("cliente parcial, com e sem representada", async () => {
      const remo = await buscarCliente({ texto: "Remo" }, ctx);
      expect(remo.clientes.map((c) => c.nome)).toEqual(["Construtora Remo Ltda"]);
      expect(remo.clientes[0].representada.nome).toBe("Signify");
      const luz = await buscarCliente({ texto: "Luz Forte", representada: "VW" }, ctx);
      expect(luz.clientes[0].nome).toMatch(/^Luz Forte/);
    });

    it("ambiguidade devolve opções em vez de chutar", async () => {
      await expect(resolverCliente(db, "Participações")).rejects.toBeInstanceOf(ErroAmbiguo);
      const erro = await capturar<ErroAmbiguo>(resolverCliente(db, "Participações"));
      expect(erro.opcoes).toHaveLength(2);
      expect(erro.opcoes.map((o) => o.detalhe)).toEqual(expect.arrayContaining([expect.stringContaining("Signify"), expect.stringContaining("F-Led")]));
      // Restrita à representada, resolve.
      const c = await resolverCliente(db, "Participações", (await buscarRepresentada({ texto: "F-Led" }, ctx)).representadas[0].id);
      expect(c.nome).toMatch(/^Alegrete/);
    });
  });

  describe("pedidos", () => {
    it("criar_pedido: 'tirei um pedido da Signify pra Remo, 85 mil, entrega em dezembro'", async () => {
      const r = await criarPedido({ representada: "Signify", cliente: "Remo", valor_total: 85000, data_prevista_faturamento: "2026-12" }, ctx);
      expect(r.pedido.numero).toBe("Pedido 07 - Outubro");
      expect(r.pedido.cliente.nome).toBe("Construtora Remo Ltda");
      expect(r.pedido.entrega_prevista).toBe("Dezembro/2026");
      expect(r.pedido.data_prevista_faturamento).toBe("2026-12-01");
      expect(r.pedido.comissao_prevista).toBe(3400);
      expect(r.mensagem).toContain("R$ 3.400,00");

      const resumo = await consultarResumo({}, ctx);
      expect(resumo.cards.a_receber_firme).toEqual(perto(104363.29 + 3400));

      const [aud] = await db`select usuario, acao from auditoria where tabela = 'pedido' and registro_id = ${r.pedido.id}`;
      expect(aud).toMatchObject({ usuario: "teste-bot", acao: "insert" });
    });

    it("criar_pedido não duplica número e sabe criar o cliente", async () => {
      await expect(criarPedido({ representada: "Signify", cliente: "Remo", valor_total: 1, numero: "Pedido 07 - Outubro" }, ctx)).rejects.toThrow(/Já existe o pedido/);
      await expect(criarPedido({ representada: "Maxi", cliente: "Ferragens Zé", valor_total: 5000 }, ctx)).rejects.toBeInstanceOf(ErroNaoEncontrado);
      const r = await criarPedido({ representada: "Maxi", cliente: "Ferragens Zé", valor_total: 5000, situacao: "previsao", criar_cliente_se_nao_existir: true }, ctx);
      expect(r.pedido.cliente.criado_agora).toBe(true);
      expect(r.pedido.comissao_percentual).toBe(8);
      const dup = await criarCliente({ representada: "Maxi Ferramentas", nome: "ferragens ze" }, ctx);
      expect(dup.criado).toBe(false);
    });

    it("atualizar_pedido: previsão vira firme, por número aproximado", async () => {
      const antes = await consultarResumo({ representada: "Signify" }, ctx);
      const r = await atualizarPedido({ numero: "pedido 06", representada: "Signify", situacao: "firme" }, ctx);
      expect(r.alterado).toBe(true);
      expect(r.pedido.numero).toBe("Pedido 06 - Dezembro");
      const depois = await consultarResumo({ representada: "Signify" }, ctx);
      expect(depois.cards.em_previsao.comissao).toEqual(perto(antes.cards.em_previsao.comissao - 45468));
      expect(depois.cards.a_receber_firme).toEqual(perto(antes.cards.a_receber_firme + 45468));

      const v = await atualizarPedido({ numero: "668", representada: "VW", valor_total: 10300, anotacao: "reajuste confirmado" }, ctx);
      expect(v.pedido.valor_total).toBe(10300);
      expect(v.pedido.valor_original).toBe(10065.17); // o original da planilha é preservado
      expect(v.pedido.observacoes).toContain("22/10/2026: reajuste confirmado");
    });

    it("listar_pedidos_em_aberto", async () => {
      const r = await listarPedidosEmAberto({ representada: "Signify" }, ctx);
      expect(r.pedidos.map((p) => p.numero)).toEqual(expect.arrayContaining(["Pedido 06 - Dezembro", "Pedido 07 - Outubro", "Pedido 01 - Setembro"]));
      expect(r.pedidos.find((p) => p.numero === "Pedido 07 - Outubro")?.comissao_sobre_saldo).toBe(3400);
      expect(r.saldo_a_faturar).toEqual(perto(r.pedidos.reduce((s, p) => s + p.saldo_a_faturar, 0)));
    });
  });

  describe("notas fiscais", () => {
    it("lancar_nf vincula ao único pedido em aberto e gera parcelas (F-Led, por parcela)", async () => {
      const r = await lancarNf({ representada: "F-Led", cliente: "Alegrete", numero: "1234", valor_total: 355404.18, data_emissao: "2026-10-20", parcelas: 3 }, ctx);
      expect(r.nf.pedido?.numero).toBe("OC 004323");
      expect(r.nf.pedido?.situacao_faturamento).toBe("Faturado integralmente");
      expect(r.nf.comissao_prevista).toEqual(perto(7108.08));
      expect(r.nf.parcelas.map((p) => p.vencimento)).toEqual(["2026-11-19", "2026-12-19", "2027-01-18"]);
      expect(r.nf.parcelas.reduce((s, p) => s + p.valor, 0)).toEqual(perto(355404.18));
      expect(r.nf.avisos[0]).toMatch(/vinculada automaticamente/);
      expect(r.nf.avisos[1]).toMatch(/item\(ns\) copiado\(s\) do pedido/);
      const [{ n }] = await db`select count(*)::int as n from nf_item where nf_venda_id = ${r.nf.id}`;
      expect(n).toBe(1);
      // Regra F-Led: comissão de cada parcela no mês seguinte ao vencimento.
      const pend = await consultarPendencias({ representada: "F-Led" }, ctx);
      const itens = pend.proximos.filter((i) => i.descricao.startsWith("NF de venda 1234"));
      expect(itens.map((i) => i.data_esperada)).toEqual(["2026-12-19", "2027-01-19", "2027-02-18"]);
    });

    it("lancar_nf recusa duplicata e pede o pedido quando há mais de um em aberto", async () => {
      await expect(lancarNf({ representada: "F-Led", cliente: "Alegrete", numero: "1234", valor_total: 1 }, ctx)).rejects.toThrow(/já está lançada/);
      const erro = await capturar<ErroAmbiguo>(lancarNf({ representada: "Signify", cliente: "Remo", numero: "600", valor_total: 50000 }, ctx));
      expect(erro).toBeInstanceOf(ErroAmbiguo);
      expect(erro.opcoes.map((o) => o.rotulo).sort()).toEqual(["Pedido 06 - Dezembro", "Pedido 07 - Outubro"]);
      // Informando o pedido, resolve; valor acima do pedido dentro de 10% ajusta o pedido (RN-04).
      const ok = await lancarNf({ representada: "Signify", pedido: "Pedido 07", numero: "600", valor_total: 86000, parcelas_detalhadas: [{ vencimento: "2026-11-30", valor: 86000 }] }, ctx);
      expect(ok.nf.cliente.nome).toBe("Construtora Remo Ltda");
      expect(ok.nf.pedido_ajustado).toEqual({ de: 85000, para: 86000 });
      expect(ok.nf.pedido?.saldo_a_faturar).toBe(0);
      expect(ok.nf.comissao_esperada_em).toBe("2026-12-08"); // emissão 22/10 + 30 + 17
    });

    it("lancar_nf sem pedido: só no modo simplificado (Maxi) ou com venda_direta", async () => {
      // R C Empreendimentos (Signify) não tem pedido em aberto: sem pedido, só como venda direta.
      await expect(lancarNf({ representada: "Signify", cliente: "R C Empreendimentos", numero: "77", valor_total: 100 }, ctx)).rejects.toThrow(ErroValidacao);
      const direta = await lancarNf({ representada: "Signify", cliente: "R C Empreendimentos", numero: "77", valor_total: 100, venda_direta: true }, ctx);
      expect(direta.nf.pedido).toBeNull();
      expect(direta.nf.comissao_prevista).toBe(4);
      const maxi = await lancarNf({ representada: "Maxi", cliente: "Ferragens Zé", numero: "5001", valor_total: 1200.5 }, ctx);
      expect(maxi.nf.pedido).toBeNull();
      expect(maxi.nf.comissao_prevista).toEqual(perto(96.04));
    });

    it("registrar_parcela_paga: uma, ambígua, todas", async () => {
      const uma = await registrarParcelaPaga({ nf: "1234", representada: "F-Led", parcela: 1, data_pagamento: "2026-11-18" }, ctx);
      expect(uma.parcelas.filter((p) => p.paga)).toHaveLength(1);
      await expect(registrarParcelaPaga({ nf: "1234" }, ctx)).rejects.toBeInstanceOf(ErroAmbiguo);
      const todas = await registrarParcelaPaga({ nf: "NF 1234", todas: true }, ctx);
      expect(todas.parcelas.every((p) => p.paga)).toBe(true);
      expect(todas.mensagem).toContain("Todas as parcelas estão pagas");
    });

    it("listar_nfs_sem_apuracao", async () => {
      const r = await listarNfsSemApuracao({ representada: "VW" }, ctx);
      expect(r.nfs.map((n) => n.numero).sort()).toEqual(["907", "925"]);
      expect(r.nfs.find((n) => n.numero === "925")?.falta_apurar).toEqual(perto(720.16));
    });
  });

  describe("apuração, NFS-e e crédito", () => {
    it("registrar_apuracao por parcela (F-Led)", async () => {
      const r = await registrarApuracao({ nf: "1234", representada: "F-Led", parcela: 1, mes_referencia: "2026-12", data_pgto_representada: "2026-12-10" }, ctx);
      expect(r.apuracao.base).toEqual(perto(118468.06));
      expect(r.apuracao.valor_apurado).toEqual(perto(2369.36));
      expect(r.apuracao.referencia).toBe("Dez/2026 - parcela 1/3");
      expect(r.nf_depois.falta_apurar).toEqual(perto(7108.08 - 2369.36));
      expect(r.aguardando_nfse_na_representada).toEqual({ quantidade: 1, valor: 2369.36 });
      await expect(registrarApuracao({ nf: "1234", parcela: 1 }, ctx)).rejects.toThrow(/já tem apuração/);
    });

    it("emitir_nfse cobre as apurações pendentes e calcula a previsão de crédito", async () => {
      const r = await emitirNfse({ representada: "F-Led", numero: "12", data_emissao: "2026-12-15" }, ctx);
      expect(r.nfse.valor).toEqual(perto(2369.36));
      expect(r.nfse.apuracoes_cobertas).toHaveLength(1);
      expect(r.nfse.previsao_credito).toBe("2027-02-13"); // 60 dias
      expect(r.nfse.status).toBe("Aguardando pagamento");
      await expect(emitirNfse({ representada: "F-Led" }, ctx)).rejects.toThrow(/não tem comissão apurada aguardando NFS-e/);
    });

    it("emitir_nfse para representada sem relatório (VW) cria a apuração a partir da NF", async () => {
      const r = await emitirNfse({ representada: "VW", nfs: ["925"], valor: 720.16, numero: "13", competencia: "2026-11" }, ctx);
      expect(r.nfse.apuracoes_cobertas).toEqual([expect.objectContaining({ nf: "925", valor_apurado: 720.16 })]);
      expect(r.nfse.referencia).toBe("Nov/2026 - NF 925");
      const [a] = await db`select origem from apuracao where id = ${r.nfse.apuracoes_cobertas[0].id}`;
      expect(a.origem).toBe("nfse_propria");
      const nfs = await listarNfsSemApuracao({ representada: "VW" }, ctx);
      expect(nfs.nfs.map((n) => n.numero)).toEqual(["907"]);
    });

    it("registrar_credito_nfse: 'recebi a comissão da Signify de setembro, caiu hoje'", async () => {
      const antes = await consultarResumo({}, ctx);
      const r = await registrarCreditoNfse({ representada: "Signify", competencia: "2026-09" }, ctx);
      expect(r.nfse.numero).toBe("10");
      expect(r.nfse.data_credito).toBe(HOJE_FIXTURE);
      expect(r.nfse.status).toBe("Recebida");
      expect(r.totais.geral_ja_recebida).toEqual(perto(antes.cards.ja_recebida + 25375.57));
      // Só sobrou uma NFS-e em aberto da Green: sem número nem mês, usa a única.
      const green = await registrarCreditoNfse({ representada: "Green", data_credito: "2026-10-21" }, ctx);
      expect(green.nfse.numero).toBe("SIM-C002");
      await expect(registrarCreditoNfse({ representada: "Green" }, ctx)).rejects.toBeInstanceOf(ErroNaoEncontrado);
      await expect(registrarCreditoNfse({}, ctx)).rejects.toBeInstanceOf(ErroAmbiguo);
    });

    it("consultar_pendencias traz agenda, matriz e ações sugeridas", async () => {
      const r = await consultarPendencias({ meses: 4 }, ctx);
      expect(r.por_mes).toHaveLength(4);
      expect(r.por_mes[0].mes).toMatch(/out/i);
      expect(r.totais.vencido).toBe(0); // a NFS-e vencida da Green foi creditada acima
      expect(r.acoes_sugeridas.some((a) => a.includes("Cobrar o relatório"))).toBe(true);
      const total = r.vencidos.length + r.atrasados_este_mes.length + r.proximos.length + r.depois_do_periodo.length + r.sem_data.length;
      expect(total).toBeGreaterThan(5);
    });

    it("tudo que o bot gravou está na auditoria como 'teste-bot'", async () => {
      const [{ n, outros }] = await db`select count(*)::int as n, count(*) filter (where usuario <> 'teste-bot')::int as outros from auditoria`;
      expect(n).toBeGreaterThan(10);
      expect(outros).toBe(0);
    });
  });
});
