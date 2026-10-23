import postgres, { type Sql } from "postgres";

/**
 * Conexão única com o Postgres (Supabase ou local). Só roda no servidor.
 * - date → 'YYYY-MM-DD' (string), sem fuso.
 * - numeric → number.
 */
declare global {
  var __sql: Sql | undefined;
}

export function criarConexao(url: string): Sql {
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // compatível com o pooler em modo transação do Supabase
    // Sem pipelining: pelo pooler (Supavisor) consultas enfileiradas na mesma
    // conexão travam e voltam com resultados trocados entre tabelas. A opção
    // existe no runtime do postgres.js mas não está nos tipos publicados.
    ...({ max_pipeline: 0 } as object),
    onnotice: () => {},
    types: {
      date: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v },
      numeric: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
    },
  });
}

export function sql(): Sql {
  if (!globalThis.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida. Copie .env.example para .env e preencha.");
    globalThis.__sql = criarConexao(url);
  }
  return globalThis.__sql;
}

/**
 * Transação explícita numa conexão reservada (BEGIN/COMMIT/ROLLBACK).
 *
 * Substitui `sql.begin`: com `max_pipeline: 0` o postgres.js nunca chama o
 * `onexecute` que `begin` usa para marcar a conexão como reservada, e todo
 * `begin` falha com UNSAFE_TRANSACTION. `reserve()` não depende disso.
 * `fn` recebe um `Sql` com todos os helpers (template, `tx(tabela)`, `unsafe`).
 */
export async function emTransacao<T>(db: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const c = await db.reserve();
  try {
    await c`begin`;
    try {
      const r = await fn(c as unknown as Sql);
      await c`commit`;
      return r;
    } catch (e) {
      await c`rollback`.catch(() => {});
      throw e;
    }
  } finally {
    c.release();
  }
}
