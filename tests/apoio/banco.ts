/**
 * Banco de testes: usa DATABASE_URL_TESTE (nunca DATABASE_URL, para não apagar
 * dados reais), aplica as migrações se necessário e carrega a fixture da
 * planilha. Quando a variável não está definida, os testes de integração são
 * pulados.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { criarConexao, emTransacao } from "@/lib/db";
import { gravarDados } from "@/lib/importador/gravar";
import type { PlanilhaLida } from "@/lib/importador/ler-planilha";
import type { Dados } from "@/lib/motor/tipos";

export const URL_TESTE = process.env.DATABASE_URL_TESTE;
export const TEM_BANCO = !!URL_TESTE;

/** Data em que a planilha foi calculada; os totais da fixture valem para ela. */
export const HOJE_FIXTURE = "2026-10-22";

export function lerFixture(): PlanilhaLida {
  return JSON.parse(readFileSync(new URL("../fixtures/planilha.json", import.meta.url), "utf8")) as PlanilhaLida;
}

export async function conectarBancoDeTeste(): Promise<Sql> {
  if (!URL_TESTE) throw new Error("DATABASE_URL_TESTE não definida");
  const db = criarConexao(URL_TESTE);
  await aplicarMigracoes(db);
  return db;
}

async function aplicarMigracoes(db: Sql) {
  const dir = join(process.cwd(), "supabase", "migrations");
  await db.unsafe(`create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz default now())`);
  const aplicadas = new Set((await db`select nome from _migracoes`).map((r) => r.nome as string));
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (aplicadas.has(arquivo)) continue;
    const conteudo = readFileSync(join(dir, arquivo), "utf8");
    await emTransacao(db, async (tx) => {
      await tx.unsafe(conteudo);
      await tx`insert into _migracoes(nome) values (${arquivo})`;
    });
  }
}

/** Recarrega a fixture da planilha (apaga tudo antes). Devolve o mapa id da fixture → uuid. */
export async function carregarFixture(db: Sql, dados: Dados = lerFixture().dados): Promise<Map<string, string>> {
  const ids = await gravarDados(db, dados, { limpar: true, usuario: "teste:fixture" });
  await db`delete from auditoria`;
  return ids;
}
