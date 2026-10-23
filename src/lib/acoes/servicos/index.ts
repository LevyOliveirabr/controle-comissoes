/**
 * Serviços de negócio reutilizáveis (bot/MCP, scripts, testes). Todos validam a
 * entrada com zod, resolvem nomes aproximados (representada, cliente, pedido,
 * NF) e gravam dentro de uma transação auditada com o usuário do contexto.
 */
export * from "./contexto";
export * from "./erros";
export { normalizar, pontuar, similaridade } from "./busca";
export { buscarRepresentada, buscarCliente, criarCliente, resolverRepresentada, resolverCliente } from "./cadastros";
export { criarPedido, atualizarPedido, listarPedidosEmAberto, resolverPedido } from "./pedidos";
export { lancarNf, registrarParcelaPaga, listarNfsSemApuracao, resolverNf } from "./notas";
export { registrarApuracao, emitirNfse, registrarCreditoNfse, resolverNfse } from "./comissoes";
export { consultarResumo, consultarPendencias } from "./consultas";
