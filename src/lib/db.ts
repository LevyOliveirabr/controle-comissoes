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
