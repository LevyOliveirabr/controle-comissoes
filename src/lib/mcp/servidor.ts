/**
 * Monta o manipulador HTTP do servidor MCP (Streamable HTTP, sem estado) já
 * protegido por token. Não importa nada do Next.js, então o mesmo manipulador
 * é usado pela rota `/api/mcp` e pelos testes (montado num servidor node:http).
 */
import { createMcpHandler } from "mcp-handler";
import type { Contexto } from "../acoes/servicos";
import { CONTEXTO_BOT } from "../acoes/servicos";
import { exigirToken, type Manipulador } from "./auth";
import { INSTRUCOES_DO_SERVIDOR, registrarFerramentas } from "./ferramentas";

export interface OpcoesServidorMcp {
  contexto?: Contexto;
  obterToken?: () => string | undefined;
  verboseLogs?: boolean;
}

export function criarManipuladorMcp(opcoes: OpcoesServidorMcp = {}): Manipulador {
  const ctx = opcoes.contexto ?? CONTEXTO_BOT;
  const manipulador = createMcpHandler((server) => registrarFerramentas(server, ctx), {
    serverInfo: { name: "controle-comissoes", version: "1.0.0" },
    instructions: INSTRUCOES_DO_SERVIDOR,
    verboseLogs: opcoes.verboseLogs ?? false,
  });
  return exigirToken(manipulador, opcoes.obterToken);
}
