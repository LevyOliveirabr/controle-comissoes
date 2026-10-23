/**
 * Proteção da rota /api/mcp por token Bearer fixo (variável MCP_TOKEN).
 *
 * O bot (Cursor/Grok) manda `Authorization: Bearer <MCP_TOKEN>` em toda
 * requisição; sem token válido a rota responde 401 e não toca no banco. Se a
 * variável não estiver configurada, a rota fica desligada (503) — nunca aberta.
 */
import { timingSafeEqual } from "node:crypto";

export type Manipulador = (req: Request) => Promise<Response>;

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function extrairBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

function respostaJson(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cabecalhos },
  });
}

/**
 * Envolve um manipulador exigindo o token. `obterToken` é injetável para os
 * testes; por padrão lê `process.env.MCP_TOKEN` a cada requisição.
 */
export function exigirToken(manipulador: Manipulador, obterToken: () => string | undefined = () => process.env.MCP_TOKEN): Manipulador {
  return async (req) => {
    const esperado = obterToken()?.trim();
    if (!esperado) {
      return respostaJson(503, {
        erro: "MCP desligado: a variável de ambiente MCP_TOKEN não está configurada no servidor.",
      });
    }
    const informado = extrairBearer(req);
    if (!informado || !iguais(informado, esperado)) {
      return respostaJson(
        401,
        { erro: "Token inválido ou ausente. Envie o cabeçalho Authorization: Bearer <MCP_TOKEN>." },
        { "www-authenticate": 'Bearer realm="controle-comissoes", error="invalid_token"' },
      );
    }
    return manipulador(req);
  };
}
