/**
 * Ferramentas MCP do controle de comissões — a "voz" do bot sobre a camada de
 * serviços (`src/lib/acoes/servicos`). Cada ferramenta:
 *  - descreve em português o que faz e como preencher os parâmetros, para o
 *    LLM resolver nomes aproximados ("Signify" → representada, "Remo" → cliente);
 *  - devolve texto legível (a `mensagem` do serviço) + o objeto completo em JSON;
 *  - quando o nome é ambíguo, devolve as opções em vez de chutar (não é erro de
 *    execução: o modelo deve perguntar ao usuário ou refazer a chamada com o id).
 * Tudo que grava passa pela auditoria com `usuario = "bot"`.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { mensagemDeErroDb } from "../acoes/base";
import {
  atualizarPedido,
  buscarCliente,
  buscarRepresentada,
  CONTEXTO_BOT,
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
  type Contexto,
} from "../acoes/servicos";

export const NOMES_DAS_FERRAMENTAS = [
  "buscar_representada",
  "buscar_cliente",
  "criar_cliente",
  "criar_pedido",
  "atualizar_pedido",
  "lancar_nf",
  "registrar_parcela_paga",
  "registrar_apuracao",
  "emitir_nfse",
  "registrar_credito_nfse",
  "consultar_resumo",
  "consultar_pendencias",
  "listar_pedidos_em_aberto",
  "listar_nfs_sem_apuracao",
] as const;

export const INSTRUCOES_DO_SERVIDOR = `Controle de comissões do Levy (representante comercial). Você registra e consulta pedidos, notas fiscais de venda (NF), apurações de comissão, NFS-e de comissão e recebimentos.

Glossário:
- representada: fábrica/empresa que paga a comissão (ex.: Signify, VW Experience, Green, Maxi Ferramentas, F-Led). Nomes aproximados são aceitos.
- cliente: quem compra da representada por intermédio do Levy (ex.: "Remo" = Construtora Remo Ltda). Sempre pertence a uma representada.
- pedido: venda tirada; vira "firme" ou fica em "previsao". Comissão prevista = valor × % da representada (ou % do pedido).
- NF (nf_venda): nota fiscal que a representada emite para o cliente faturando o pedido. É sobre a NF que a comissão é calculada. Pode ter parcelas.
- apuração: a representada confirma a comissão de uma NF (relatório mensal). Representadas que não enviam relatório (VW, Green) têm a apuração criada junto com a NFS-e.
- NFS-e: nota de serviço que o Levy emite contra a representada para receber a comissão apurada. "Recebi a comissão" = registrar_credito_nfse.

Fluxo normal: criar_pedido → lancar_nf (com parcelas) → registrar_parcela_paga (opcional) → registrar_apuracao → emitir_nfse → registrar_credito_nfse.

Regras de uso:
- Datas em ISO 'AAAA-MM-DD'; meses em 'AAAA-MM'. Se o usuário disser "hoje" ou não disser a data, omita o campo (o servidor usa a data de hoje em Brasília). "Dezembro" sem ano = o próximo dezembro.
- Valores em reais como número (85 mil → 85000; "R$ 10.288,03" → 10288.03). Percentuais em pontos (4% → 4).
- Quando a resposta trouxer "opcoes", NÃO escolha sozinho: mostre as opções ao usuário ou use um dado adicional que ele deu (representada, cliente, número) e refaça a chamada.
- Antes de criar algo, se houver dúvida sobre o nome da representada ou do cliente, use buscar_representada / buscar_cliente.
- Sempre repita ao usuário o que foi gravado (número, valor, comissão prevista, datas) usando a "mensagem" da resposta.`;

type Resultado = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function texto(mensagem: string, dados?: unknown): Resultado["content"] {
  const partes = [mensagem];
  if (dados !== undefined) partes.push(JSON.stringify(dados, null, 2));
  return [{ type: "text", text: partes.join("\n\n") }];
}

/** Converte o retorno (ou erro) de um serviço em resultado MCP. */
export async function executarFerramenta(nome: string, fn: () => Promise<Record<string, unknown>>): Promise<Resultado> {
  try {
    const r = await fn();
    const mensagem = typeof r.mensagem === "string" ? r.mensagem : `${nome}: ok.`;
    return { content: texto(mensagem, r), structuredContent: r };
  } catch (e) {
    if (e instanceof ErroAmbiguo) {
      const dados = { ambiguo: true, entidade: e.entidade, texto: e.texto, opcoes: e.opcoes };
      return { content: texto(`${e.message} Opções encontradas — peça ao usuário para escolher ou refaça a chamada com mais detalhes:`, dados), structuredContent: dados };
    }
    if (e instanceof ErroNaoEncontrado) {
      const dados = { nao_encontrado: true, entidade: e.entidade, texto: e.texto, sugestoes: e.sugestoes };
      const dica = e.sugestoes.length ? " Parecidos:" : "";
      return { content: texto(`${e.message}${dica}`, dados), structuredContent: dados, isError: true };
    }
    if (e instanceof ErroValidacao) {
      return { content: texto(`Não foi possível executar ${nome}: ${e.message}`), isError: true };
    }
    const msg = mensagemDeErroDb(e);
    return { content: texto(`Erro em ${nome}: ${msg}`), isError: true };
  }
}

// --- Esquemas (com descrições para o LLM) ------------------------------------------

const campo = {
  representada: z.string().describe("Nome (aproximado), CNPJ ou id da representada. Ex.: 'Signify', 'VW', 'F-Led'."),
  representadaOpc: z.string().nullish().describe("Nome (aproximado), CNPJ ou id da representada. Opcional, ajuda a desambiguar."),
  cliente: z.string().describe("Nome (aproximado), CNPJ ou id do cliente. Ex.: 'Remo', 'Luz Forte', 'Alegrete'."),
  clienteOpc: z.string().nullish().describe("Nome (aproximado), CNPJ ou id do cliente. Opcional."),
  dataIso: (desc: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD").nullish().describe(desc),
  mesAno: (desc: string) => z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "use AAAA-MM").nullish().describe(desc),
  dinheiro: (desc: string) => z.number().min(0).describe(desc),
  dinheiroOpc: (desc: string) => z.number().min(0).nullish().describe(desc),
  pctOpc: z.number().min(0).max(100).nullish().describe("Percentual de comissão em pontos (4 = 4%). Só informe se diferir do padrão da representada."),
  observacoes: z.string().nullish().describe("Observações livres."),
};

const esqBuscarRepresentada = z.object({
  texto: z.string().nullish().describe("Nome aproximado ou CNPJ. Vazio lista todas."),
});

const esqBuscarCliente = z.object({
  texto: z.string().nullish().describe("Nome aproximado ou CNPJ. Vazio lista todos."),
  representada: campo.representadaOpc,
});

const esqCriarCliente = z.object({
  representada: campo.representada,
  nome: z.string().min(1).describe("Razão social ou nome usual do cliente."),
  cnpj: z.string().nullish().describe("CNPJ (com ou sem pontuação)."),
  codigo_externo: z.string().nullish().describe("Código do cliente no sistema da representada, se houver."),
  observacoes: campo.observacoes,
});

const esqCriarPedido = z.object({
  representada: campo.representada,
  cliente: campo.cliente,
  valor_total: campo.dinheiro("Valor total do pedido em reais (85 mil → 85000)."),
  numero: z.string().nullish().describe("Número/identificação do pedido (ex.: 'OC 001160', 'PV 668'). Se omitido, gera 'Pedido NN - Mês'."),
  situacao: z.enum(["firme", "previsao"]).nullish().describe("'firme' (padrão) quando o pedido está fechado; 'previsao' quando ainda é expectativa."),
  data_pedido: campo.dataIso("Data do pedido 'AAAA-MM-DD'. Omita para hoje."),
  data_prevista_faturamento: campo.mesAno("Quando a representada deve faturar/entregar: 'AAAA-MM' ou 'AAAA-MM-DD'. 'entrega em dezembro' → '2026-12'."),
  entrega_prevista: z.string().nullish().describe("Texto livre da entrega (ex.: 'Dezembro/2026'). Se omitido, deriva da data prevista."),
  comissao_percentual: campo.pctOpc,
  referencia: z.string().nullish().describe("Referência/proposta/projeto (ex.: 'Proposta 668 - PCBA 18 leds')."),
  observacoes: campo.observacoes,
  criar_cliente_se_nao_existir: z.boolean().nullish().describe("true para cadastrar o cliente automaticamente se ele não existir nessa representada."),
});

const esqAtualizarPedido = z.object({
  pedido_id: z.string().nullish().describe("Id do pedido, quando já conhecido (vindo de uma resposta anterior)."),
  numero: z.string().nullish().describe("Número aproximado do pedido (ex.: 'pedido 06', '668')."),
  representada: campo.representadaOpc,
  cliente: campo.clienteOpc,
  situacao: z.enum(["firme", "previsao", "convertido", "cancelado"]).nullish().describe("Nova situação comercial. 'previsão virou pedido' → 'firme'."),
  valor_total: campo.dinheiroOpc("Novo valor total (o original é guardado)."),
  data_prevista_faturamento: campo.mesAno("Nova previsão de faturamento 'AAAA-MM' ou 'AAAA-MM-DD'."),
  entrega_prevista: z.string().nullish().describe("Novo texto de entrega prevista."),
  comissao_percentual: campo.pctOpc,
  novo_numero: z.string().nullish().describe("Renomear o pedido."),
  anotacao: z.string().nullish().describe("Anotação a acrescentar nas observações (fica datada)."),
});

const esqItemNf = z.object({
  familia: z.string().min(1).describe("Família/descrição do item igual à do pedido (ex.: '150W')."),
  qtd: z.number().min(0).describe("Quantidade faturada."),
  valor_total: z.number().min(0).nullish().describe("Valor total do item; se omitido usa qtd × valor unitário do pedido."),
  codigo: z.string().nullish(),
});

const esqLancarNf = z.object({
  representada: campo.representada,
  numero: z.string().min(1).describe("Número da NF (ex.: '925')."),
  valor_total: campo.dinheiro("Valor total da NF em reais."),
  cliente: campo.clienteOpc,
  pedido: z.string().nullish().describe("Número aproximado do pedido faturado. Se omitido e o cliente tiver um único pedido em aberto, vincula automaticamente."),
  pedido_id: z.string().nullish().describe("Id do pedido (alternativa a 'pedido')."),
  data_emissao: campo.dataIso("Data de emissão 'AAAA-MM-DD'. Omita para hoje."),
  valor_produtos: campo.dinheiroOpc("Valor dos produtos, se diferente do total (base de cálculo quando a representada comissiona sobre produtos)."),
  parcelas: z.number().int().min(1).max(48).nullish().describe("Quantidade de parcelas iguais ('3 parcelas' → 3). Vencimentos a cada prazo_parcela_dias após a emissão."),
  prazo_parcela_dias: z.number().int().min(1).max(365).nullish().describe("Intervalo entre parcelas em dias (padrão 30)."),
  parcelas_detalhadas: z
    .array(z.object({ vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.number().min(0) }))
    .nullish()
    .describe("Parcelas com vencimento e valor explícitos, quando o usuário informar."),
  itens: z.array(esqItemNf).nullish().describe("Itens faturados, só quando o pedido controla itens e a NF é parcial."),
  comissao_percentual: campo.pctOpc,
  serie: z.string().nullish().describe("Série da NF (padrão '1')."),
  chave_acesso: z.string().nullish().describe("Chave de acesso de 44 dígitos, se informada."),
  venda_direta: z.boolean().nullish().describe("true quando a NF não tem pedido (venda direta) em representada de controle completo."),
  ajustar_pedido: z.boolean().nullish().describe("Forçar (true) ou impedir (false) o ajuste do valor do pedido para o valor da NF. Omita para a regra padrão (ajusta se for a 1ª NF e a diferença ≤ 10%)."),
  observacoes: campo.observacoes,
});

const esqParcelaPaga = z.object({
  nf: z.string().nullish().describe("Número da NF."),
  nf_id: z.string().nullish(),
  representada: campo.representadaOpc,
  cliente: campo.clienteOpc,
  parcela: z.number().int().min(1).nullish().describe("Número da parcela paga (1, 2, 3...). Se a NF tiver uma só, pode omitir."),
  todas: z.boolean().nullish().describe("true para marcar todas as parcelas como pagas."),
  data_pagamento: campo.dataIso("Data em que o cliente pagou. Omita para hoje."),
  desfazer: z.boolean().nullish().describe("true para voltar a parcela para 'em aberto'."),
});

const esqApuracao = z.object({
  nf: z.string().nullish().describe("Número da NF de venda cuja comissão a representada apurou."),
  nf_id: z.string().nullish(),
  representada: campo.representadaOpc,
  cliente: campo.clienteOpc,
  mes_referencia: campo.mesAno("Mês do relatório da representada 'AAAA-MM'. Omita para o mês atual."),
  base: campo.dinheiroOpc("Base de cálculo apurada, se diferente do valor da NF/parcela."),
  valor_apurado: campo.dinheiroOpc("Valor da comissão apurada, se diferente de base × %."),
  comissao_percentual: campo.pctOpc,
  parcela: z.number().int().min(1).nullish().describe("Número da parcela, para representadas que liberam comissão por parcela (F-Led)."),
  data_pgto_representada: campo.dataIso("Data em que a representada informa que vai pagar / pagou."),
  nr_pgto: z.string().nullish().describe("Número do pagamento/relatório da representada."),
  referencia: z.string().nullish().describe("Referência do relatório (gerada automaticamente se omitida)."),
  observacoes: campo.observacoes,
});

const esqNfse = z.object({
  representada: campo.representada,
  valor: campo.dinheiroOpc("Valor da NFS-e. Se omitido, soma as apurações cobertas."),
  numero: z.string().nullish().describe("Número da NFS-e emitida na prefeitura."),
  data_emissao: campo.dataIso("Data de emissão. Omita para hoje."),
  competencia: campo.mesAno("Competência 'AAAA-MM' (filtra as apurações desse mês; se não houver, usa todas as pendentes)."),
  referencia: z.string().nullish().describe("Descrição/referência da NFS-e."),
  nfs: z.array(z.string()).nullish().describe("Números das NFs de venda cobertas — use quando a representada não envia relatório (VW, Green) ou para escolher NFs específicas."),
  apuracao_ids: z.array(z.string()).nullish().describe("Ids de apurações específicas a cobrir."),
  data_credito: campo.dataIso("Se a comissão já caiu na conta, a data do crédito."),
  enviada_em: campo.dataIso("Data em que a NFS-e foi enviada à representada."),
  chave_acesso: z.string().nullish(),
  observacoes: campo.observacoes,
});

const esqCredito = z.object({
  representada: campo.representadaOpc,
  nfse_id: z.string().nullish(),
  numero: z.string().nullish().describe("Número da NFS-e recebida."),
  competencia: campo.mesAno("Mês da comissão recebida 'AAAA-MM' ('comissão de outubro' → '2026-10')."),
  data_credito: campo.dataIso("Data do crédito. Omita para hoje ('caiu hoje')."),
  aproximada: z.boolean().nullish().describe("true se a data é aproximada."),
  valor_creditado: campo.dinheiroOpc("Valor efetivamente creditado, se diferente da NFS-e."),
  desfazer: z.boolean().nullish().describe("true para desmarcar o recebimento."),
});

const esqFiltro = z.object({
  representada: campo.representadaOpc,
  cliente: campo.clienteOpc,
});

const esqPendencias = esqFiltro.extend({
  meses: z.number().int().min(1).max(12).nullish().describe("Horizonte em meses (padrão 6)."),
  incluir_previsao: z.boolean().nullish().describe("false para considerar só o que é firme."),
});

const esqPedidosAbertos = esqFiltro.extend({
  incluir_previsao: z.boolean().nullish().describe("false para omitir pedidos em previsão."),
});

// --- Registro ----------------------------------------------------------------------

type Qualquer = Record<string, unknown>;

export function registrarFerramentas(server: McpServer, ctx: Contexto = CONTEXTO_BOT): void {
  const svc = <T extends Qualquer>(p: Promise<T>) => p as Promise<Qualquer>;

  server.registerTool(
    "buscar_representada",
    {
      title: "Buscar representada",
      description:
        "Lista as representadas (fábricas que pagam comissão) com % de comissão, modo de controle, regras e clientes. Use para resolver um nome aproximado ('Signfy' → Signify) ou para ver quais existem. Sem texto, lista todas.",
      inputSchema: esqBuscarRepresentada,
    },
    (a) => executarFerramenta("buscar_representada", () => svc(buscarRepresentada(a, ctx))),
  );

  server.registerTool(
    "buscar_cliente",
    {
      title: "Buscar cliente",
      description:
        "Busca clientes por nome aproximado ou CNPJ, opcionalmente dentro de uma representada. Devolve a representada de cada um e quantos pedidos em aberto têm. Use antes de criar pedido/NF quando não tiver certeza do nome.",
      inputSchema: esqBuscarCliente,
    },
    (a) => executarFerramenta("buscar_cliente", () => svc(buscarCliente(a, ctx))),
  );

  server.registerTool(
    "criar_cliente",
    {
      title: "Criar cliente",
      description: "Cadastra um cliente novo em uma representada. Se já existir um com o mesmo nome ou CNPJ nessa representada, devolve o existente sem duplicar (criado=false).",
      inputSchema: esqCriarCliente,
    },
    (a) => executarFerramenta("criar_cliente", () => svc(criarCliente(a, ctx))),
  );

  server.registerTool(
    "criar_pedido",
    {
      title: "Criar pedido",
      description:
        "Registra um pedido tirado ('tirei um pedido da Signify pra Remo, 85 mil, entrega em dezembro' → representada='Signify', cliente='Remo', valor_total=85000, data_prevista_faturamento='2026-12'). Devolve número gerado, comissão prevista e datas. Se o cliente não existir, responde com sugestões — confirme com o usuário e repita com criar_cliente_se_nao_existir=true.",
      inputSchema: esqCriarPedido,
    },
    (a) => executarFerramenta("criar_pedido", () => svc(criarPedido(a, ctx))),
  );

  server.registerTool(
    "atualizar_pedido",
    {
      title: "Atualizar pedido",
      description:
        "Altera um pedido existente: situação (previsão → firme, cancelado, convertido), valor total, previsão de faturamento/entrega, % de comissão, número, ou acrescenta uma anotação. Identifique o pedido por pedido_id ou por número aproximado + representada/cliente.",
      inputSchema: esqAtualizarPedido,
    },
    (a) => executarFerramenta("atualizar_pedido", () => svc(atualizarPedido(a, ctx))),
  );

  server.registerTool(
    "lancar_nf",
    {
      title: "Lançar NF de venda",
      description:
        "Lança a nota fiscal que a representada emitiu para o cliente ('chegou a NF 925 da VW pra Luz Forte, R$ 10.288,03, 3 parcelas' → representada='VW', cliente='Luz Forte', numero='925', valor_total=10288.03, parcelas=3). Vincula ao pedido (informado ou o único em aberto do cliente), gera as parcelas, ajusta o valor do pedido quando a NF vem um pouco maior (≤10%) e devolve comissão prevista e a data esperada do recebimento. Representadas em modo simplificado (Maxi) aceitam NF sem pedido; nas demais use venda_direta=true. Se houver mais de um pedido em aberto, devolve as opções.",
      inputSchema: esqLancarNf,
    },
    (a) => executarFerramenta("lancar_nf", () => svc(lancarNf(a, ctx))),
  );

  server.registerTool(
    "registrar_parcela_paga",
    {
      title: "Registrar parcela paga",
      description:
        "Marca uma parcela (ou todas) de uma NF de venda como paga pelo cliente ('o cliente pagou a 1ª parcela da NF 1234'). Importa para representadas que só liberam comissão após o pagamento (F-Led). Use desfazer=true para reverter.",
      inputSchema: esqParcelaPaga,
    },
    (a) => executarFerramenta("registrar_parcela_paga", () => svc(registrarParcelaPaga(a, ctx))),
  );

  server.registerTool(
    "registrar_apuracao",
    {
      title: "Registrar apuração de comissão",
      description:
        "Registra que a representada apurou/confirmou a comissão de uma NF de venda no relatório do mês ('a Signify apurou a NF 600 no relatório de dezembro'). Base e valor padrão vêm da NF (ou da parcela, para F-Led). Depois disso a comissão fica 'aguardando NFS-e'.",
      inputSchema: esqApuracao,
    },
    (a) => executarFerramenta("registrar_apuracao", () => svc(registrarApuracao(a, ctx))),
  );

  server.registerTool(
    "emitir_nfse",
    {
      title: "Emitir NFS-e de comissão",
      description:
        "Registra a NFS-e que o Levy emitiu contra a representada para receber a comissão ('emiti a NFS-e 12 pra F-Led'). Cobre as apurações pendentes da representada (ou da competência/NFs informadas), calcula a previsão de crédito pelo prazo da representada e devolve o checklist de envio. Para representadas sem relatório (VW, Green), informe as NFs de venda em 'nfs' — a apuração é criada junto.",
      inputSchema: esqNfse,
    },
    (a) => executarFerramenta("emitir_nfse", () => svc(emitirNfse(a, ctx))),
  );

  server.registerTool(
    "registrar_credito_nfse",
    {
      title: "Registrar recebimento da comissão",
      description:
        "Marca uma NFS-e como recebida ('recebi a comissão da Signify de outubro, caiu hoje' → representada='Signify', competencia='2026-10'; data_credito omitida = hoje). Se a representada só tiver uma NFS-e em aberto, não precisa de número nem competência. Devolve o total já recebido.",
      inputSchema: esqCredito,
    },
    (a) => executarFerramenta("registrar_credito_nfse", () => svc(registrarCreditoNfse(a, ctx))),
  );

  server.registerTool(
    "consultar_resumo",
    {
      title: "Consultar resumo",
      description:
        "Visão geral das comissões ('como estão as comissões?', 'quanto tenho a receber da Signify?'): já recebida, a receber firme, em previsão, vencido, carteira, funil por etapa, próximos meses e totais por representada. Filtros opcionais por representada e cliente.",
      inputSchema: esqFiltro,
    },
    (a) => executarFerramenta("consultar_resumo", () => svc(consultarResumo(a, ctx))),
  );

  server.registerTool(
    "consultar_pendencias",
    {
      title: "Consultar pendências e agenda",
      description:
        "Agenda de recebimentos e pendências ('o que tenho pra receber?', 'o que está atrasado?'): vencidos, atrasados do mês, próximos, por mês, e ações sugeridas (cobrar relatório, emitir NFS-e, cobrar pagamento). Filtros opcionais.",
      inputSchema: esqPendencias,
    },
    (a) => executarFerramenta("consultar_pendencias", () => svc(consultarPendencias(a, ctx))),
  );

  server.registerTool(
    "listar_pedidos_em_aberto",
    {
      title: "Listar pedidos em aberto",
      description: "Pedidos com saldo a faturar ('quais pedidos da Signify ainda não foram faturados?'), com saldo e comissão sobre o saldo. Útil antes de lancar_nf para saber a qual pedido vincular.",
      inputSchema: esqPedidosAbertos,
    },
    (a) => executarFerramenta("listar_pedidos_em_aberto", () => svc(listarPedidosEmAberto(a, ctx))),
  );

  server.registerTool(
    "listar_nfs_sem_apuracao",
    {
      title: "Listar NFs sem apuração",
      description: "NFs de venda faturadas cuja comissão ainda não foi apurada pela representada ('o que a VW ainda não apurou?'), com o valor que falta apurar. Útil antes de registrar_apuracao ou emitir_nfse.",
      inputSchema: esqFiltro,
    },
    (a) => executarFerramenta("listar_nfs_sem_apuracao", () => svc(listarNfsSemApuracao(a, ctx))),
  );
}
