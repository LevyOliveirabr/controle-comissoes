/**
 * Aplica as migrações SQL de supabase/migrations/ em ordem, controlando o que já
 * rodou na tabela `_migracoes`. Funciona com qualquer Postgres (local, Docker ou
 * Supabase via connection string). Em produção com Supabase CLI prefira
 * `supabase db push`; este script existe para quem não tem Docker/CLI.
 *
 * Uso: npm run db:migrate            (aplica pendentes)
 *      npm run db:migrate -- --reset (DROP SCHEMA public e reaplica tudo — só em dev!)
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { emTransacao } from "../src/lib/db";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (ou DATABASE_URL_DIRECT) no .env");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const dir = join(process.cwd(), "supabase", "migrations");
const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  if (reset) {
    console.log("Recriando schema public...");
    await sql.unsafe("drop schema public cascade; create schema public;");
  }
  await sql.unsafe(`create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz default now())`);
  const aplicadas = new Set((await sql`select nome from _migracoes`).map((r) => r.nome as string));
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let n = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const conteudo = readFileSync(join(dir, arquivo), "utf8");
    console.log(`Aplicando ${arquivo}...`);
    await emTransacao(sql, async (tx) => {
      await tx.unsafe(conteudo);
      await tx`insert into _migracoes(nome) values (${arquivo})`;
    });
    n++;
  }
  console.log(n ? `${n} migração(ões) aplicada(s).` : "Nada a aplicar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
