/**
 * Servidor MCP remoto (Streamable HTTP) para o bot do Levy.
 *
 * URL: https://<dominio>/api/mcp — protegida por `Authorization: Bearer <MCP_TOKEN>`.
 * Não passa pelo Basic Auth do site (ver src/proxy.ts); a autenticação é própria.
 */
import { criarManipuladorMcp } from "@/lib/mcp/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const manipulador = criarManipuladorMcp({ verboseLogs: process.env.MCP_LOGS === "1" });

export const GET = manipulador;
export const POST = manipulador;
export const DELETE = manipulador;
