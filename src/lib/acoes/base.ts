/**
 * Base compartilhada das ações: esquemas zod, erros, transação com auditoria e
 * tradução de erros do banco. Não depende do Next.js, por isso pode ser usada
 * tanto pelas Server Actions (util.ts) quanto pelos serviços do bot/MCP e pelos
 * testes.
 */
import { z } from "zod";
import type { Sql } from "postgres";
import { emTransacao, sql } from "../db";

export const esquemas = {
  uuid: z.uuid(),
  uuidOpcional: z.uuid().nullable(),
  texto: z.string().min(1, "obrigatório"),
  textoOpcional: z.string().nullable(),
  dinheiro: z.number({ error: "informe um número" }).min(0, "não pode ser negativo"),
  dinheiroOpcional: z.number({ error: "informe um número" }).nullable(),
  pct: z.number({ error: "informe um percentual" }).min(0).max(1, "percentual acima de 100%"),
  pctOpcional: z.number({ error: "informe um percentual" }).min(0).max(1, "percentual acima de 100%").nullable(),
  dataIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida"),
  dataIsoOpcional: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida").nullable(),
  inteiro: z.number().int().min(0),
};

export class ErroValidacao extends Error {}

/** Valida com zod e converte erros para uma mensagem legível em pt-BR. */
export function validar<T>(schema: z.ZodType<T>, valor: unknown): T {
  const r = schema.safeParse(valor);
  if (r.success) return r.data;
  const msg = r.error.issues.map((i) => `${i.path.join(".") || "campo"}: ${i.message}`).join("; ");
  throw new ErroValidacao(msg);
}

/**
 * Executa `fn` em uma transação com o usuário setado para a trigger de
 * auditoria (`current_setting('app.usuario')`).
 */
export async function transacaoComo<T>(usuario: string, fn: (tx: Sql) => Promise<T>, db: Sql = sql()): Promise<T> {
  return emTransacao(db, async (tx) => {
    await tx`select set_config('app.usuario', ${usuario}, true)`;
    return fn(tx);
  });
}

/** Transforma erros de banco (unique, check, triggers) em mensagens amigáveis. */
export function mensagemDeErroDb(e: unknown): string {
  const err = e as { code?: string; constraint_name?: string; message?: string; detail?: string };
  if (err.code === "23505") return `Registro duplicado (${err.constraint_name ?? err.detail ?? "chave única"}).`;
  if (err.code === "23503") return "Não é possível excluir: há registros dependentes (NFs, parcelas ou apurações).";
  if (err.code === "23514") return `Valor inválido (${err.constraint_name ?? "restrição"}).`;
  if (err.code === "P0001") return err.message ?? "Regra de integridade violada.";
  return err.message ?? "Erro inesperado.";
}

export { z };
