/**
 * Sobe um servidor node:http que encaminha cada requisição para um manipulador
 * web-standard `(Request) => Promise<Response>` — o mesmo que a rota Next usa.
 * Assim o teste de ponta a ponta fala com o MCP por HTTP de verdade.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

export type Manipulador = (req: Request) => Promise<Response>;

async function lerCorpo(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const partes: Buffer[] = [];
  for await (const pedaco of req) partes.push(pedaco as Buffer);
  return Buffer.concat(partes);
}

function paraRequest(req: IncomingMessage, origem: string, corpo: Buffer | undefined): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  return new Request(new URL(req.url ?? "/", origem), {
    method: req.method,
    headers,
    body: corpo && corpo.length ? new Uint8Array(corpo) : undefined,
  });
}

async function escrever(resposta: Response, res: ServerResponse) {
  res.statusCode = resposta.status;
  resposta.headers.forEach((v, k) => res.setHeader(k, v));
  if (!resposta.body) return res.end();
  const fluxo = Readable.fromWeb(resposta.body as import("node:stream/web").ReadableStream);
  fluxo.pipe(res);
  await new Promise<void>((ok, erro) => {
    fluxo.on("end", ok);
    fluxo.on("error", erro);
  });
}

export async function subirServidor(manipulador: Manipulador, caminho = "/api/mcp"): Promise<{ url: string; fechar: () => Promise<void> }> {
  const servidor: Server = createServer(async (req, res) => {
    try {
      const corpo = await lerCorpo(req);
      const origem = `http://${req.headers.host ?? "127.0.0.1"}`;
      const resposta = await manipulador(paraRequest(req, origem, corpo));
      await escrever(resposta, res);
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const endereco = servidor.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
  return {
    url: `http://127.0.0.1:${porta}${caminho}`,
    fechar: () =>
      new Promise<void>((ok, erro) => {
        servidor.closeAllConnections?.();
        servidor.close((e) => (e ? erro(e) : ok()));
      }),
  };
}
