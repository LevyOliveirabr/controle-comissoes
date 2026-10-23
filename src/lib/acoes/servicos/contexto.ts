import type { Sql } from "postgres";
import { sql } from "../../db";
import { transacaoComo } from "../base";

/**
 * Contexto de execução dos serviços: quem está operando (vai para a coluna
 * `usuario` da auditoria — o bot usa "bot") e, opcionalmente, a conexão.
 */
export interface Contexto {
  usuario: string;
  db?: Sql;
  /** Data de referência 'AAAA-MM-DD' (padrão: hoje em Brasília). Útil nos testes. */
  hoje?: string;
}

export const CONTEXTO_BOT: Contexto = { usuario: "bot" };

export function conexao(ctx: Contexto): Sql {
  return ctx.db ?? sql();
}

/** Roda `fn` dentro de uma transação auditada como `ctx.usuario`. */
export function executar<T>(ctx: Contexto, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const db = conexao(ctx);
  // Já dentro de uma transação (um serviço chamando outro): reaproveita.
  if (typeof (db as { begin?: unknown }).begin !== "function") return fn(db);
  return transacaoComo(ctx.usuario, fn, db);
}

/** Data de hoje no fuso de Brasília, em 'AAAA-MM-DD'. */
export function hojeBrasil(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return partes; // en-CA já devolve AAAA-MM-DD
}

export function hojeDe(ctx: Contexto): string {
  return ctx.hoje ?? hojeBrasil();
}
