import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "../db";

/** Leitura tolerante dos campos de formulário. */
export const campos = {
  texto: (fd: FormData, nome: string) => {
    const v = fd.get(nome);
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s === "" ? null : s;
  },
  numero: (fd: FormData, nome: string) => {
    const s = campos.texto(fd, nome);
    if (s == null) return null;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "") || s);
    return Number.isFinite(n) ? n : NaN;
  },
  /** Percentual digitado "4" ou "4,5" → 0.04 / 0.045. */
  pct: (fd: FormData, nome: string) => {
    const n = campos.numero(fd, nome);
    return n == null || Number.isNaN(n) ? n : n / 100;
  },
  data: (fd: FormData, nome: string) => campos.texto(fd, nome),
  bool: (fd: FormData, nome: string) => fd.get(nome) === "on" || fd.get(nome) === "true",
};

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

/** Redireciona de volta para `voltar` com o erro na query string. */
export function redirecionarComErro(voltar: string, erro: unknown): never {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const sep = voltar.includes("?") ? "&" : "?";
  redirect(`${voltar}${sep}erro=${encodeURIComponent(msg)}`);
}

export function redirecionarComOk(destino: string, mensagem = "Salvo com sucesso."): never {
  const sep = destino.includes("?") ? "&" : "?";
  redirect(`${destino}${sep}ok=${encodeURIComponent(mensagem)}`);
}

/**
 * Executa `fn` em uma transação com o usuário setado para a trigger de auditoria.
 * Enquanto não há login, grava 'app' como usuário.
 */
export async function transacao<T>(fn: (tx: ReturnType<typeof sql>) => Promise<T>): Promise<T> {
  const db = sql();
  return db.begin(async (tx) => {
    await tx`select set_config('app.usuario', ${process.env.APP_USUARIO ?? "app"}, true)`;
    return fn(tx as unknown as ReturnType<typeof sql>);
  }) as Promise<T>;
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

/** Invalida todas as telas (tudo é derivado do mesmo conjunto de dados). */
export function revalidarTudo() {
  revalidatePath("/", "layout");
}

export { z };
